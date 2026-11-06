import { useMemo, useState } from "react";
import {
  pct,
  RISK_LABELS,
  riskKeys,
  toCanRisk,
  type CanRiskModel,
  type CanRiskResult,
  type PedigreeResult,
  type RiskRow,
} from "../model/canrisk";
import type { Relation } from "../model/relations";
import type { Pedigree, Person } from "../model/types";
import { countRiskFactors } from "./PatientInfoModal";

interface Props {
  pedigree: Pedigree;
  relations: Record<string, Relation>;
  onEditInfo: (id: string) => void;
}

const MODELS: { key: CanRiskModel; label: string }[] = [
  { key: "boadicea", label: "Sein (BOADICEA)" },
  { key: "ovarian", label: "Ovaire" },
  { key: "prostate", label: "Prostate" },
];


function RiskTable({ title, rows, baseline }: { title: string; rows?: RiskRow[]; baseline?: RiskRow[] }) {
  if (!rows?.length) return null;
  const keys = riskKeys(rows);
  return (
    <div className="risk-block">
      <div className="risk-title">{title}</div>
      <table className="risk-table">
        <thead>
          <tr>
            <th>Jusqu'à</th>
            {keys.map((k) => (
              <th key={k}>{RISK_LABELS[k] ?? k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const b = baseline?.find((x) => x.age === r.age);
            return (
              <tr key={r.age}>
                <td>{r.age} ans</td>
                {keys.map((k) => (
                  <td key={k}>
                    <strong>{pct(r[k])}</strong>
                    {b && <span className="muted"> (pop. {pct(b[k])})</span>}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function summary(r: PedigreeResult, res: CanRiskResult, modelLabel: string, targetLabel: string): string {
  const lines: string[] = [];
  lines.push(`ESTIMATION DU RISQUE (CanRisk – ${modelLabel}${res.version ? `, ${res.version}` : ""})`);
  lines.push(`Personne concernée : ${targetLabel}.`);
  const fmt = (rows: RiskRow[] | undefined, base: RiskRow[] | undefined, label: string) => {
    for (const row of rows ?? []) {
      const b = base?.find((x) => x.age === row.age);
      const parts = riskKeys([row]).map(
        (k) => `${(RISK_LABELS[k] ?? k).toLowerCase()} ${pct(row[k])}${b ? ` (population générale : ${pct(b[k])})` : ""}`,
      );
      lines.push(`${label} ${row.age} ans : ${parts.join(" ; ")}.`);
    }
  };
  fmt(r.lifetime_cancer_risk, r.baseline_lifetime_cancer_risk, "Risque cumulé de 20 à");
  fmt(r.ten_yr_cancer_risk, r.baseline_ten_yr_cancer_risk, "Risque entre 40 ans et");
  const last = r.cancer_risks?.[r.cancer_risks.length - 1];
  if (last) fmt([last], r.baseline_cancer_risks, "Risque à partir de l'âge actuel jusqu'à");
  const carriers = (r.mutation_probabilties ?? []).flatMap((m) => Object.entries(m)).filter(([g]) => g !== "no mutation");
  if (carriers.length) lines.push(`Probabilité d'être porteur(se) : ${carriers.map(([g, v]) => `${g} ${pct(v)}`).join(", ")}.`);
  return lines.join("\n");
}

export function RiskPanel({ pedigree, relations, onEditInfo }: Props) {
  const defaultTarget = pedigree.persons[pedigree.probandId]?.sex === "F" ? pedigree.probandId : "";
  const [chosenId, setTargetId] = useState(defaultTarget);
  // Après un changement d'arbre (nouveau, démo, import), la cible revient au cas index
  const targetId = pedigree.persons[chosenId] ? chosenId : defaultTarget;
  const [model, setModel] = useState<CanRiskModel>("boadicea");
  const [rates, setRates] = useState("UK");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ data: CanRiskResult; input: string; model: CanRiskModel } | null>(null);
  const [copied, setCopied] = useState(false);

  const target = pedigree.persons[targetId];
  const exp = useMemo(() => toCanRisk(pedigree, targetId, model), [pedigree, targetId, model]);
  const stale = result && result.input !== exp.text;
  const pr = result?.data.pedigree_result?.[0];

  const candidates = Object.values(pedigree.persons).filter((p) => !p.deceased && (model === "prostate" ? p.sex === "M" : p.sex === "F"));
  const label = (p: Person) => {
    const rel = p.id === pedigree.probandId ? "cas index" : (relations[p.id]?.label ?? "");
    return p.label ? `${rel} – ${p.label}` : rel;
  };

  const run = async () => {
    setStatus("loading");
    setError("");
    try {
      const r = await fetch("api/canrisk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, pedigree_data: exp.text, cancer_rates: rates, mut_freq: "UK" }),
      });
      const isJson = r.headers.get("content-type")?.includes("json");
      if (!isJson) throw new Error("serveur GENUS absent : le calcul CanRisk n'est pas disponible sur le site statique (voir README).");
      const data = await r.json();
      if (!r.ok) throw new Error(typeof data.detail === "string" ? data.detail : JSON.stringify(data));
      setResult({ data, input: exp.text, model });
      setStatus("idle");
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  };

  const download = () => {
    const blob = new Blob([exp.text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `canrisk-${pedigree.consultation.date || "genus"}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const copySummary = async () => {
    if (!pr || !result) return;
    await navigator.clipboard.writeText(summary(pr, result.data, MODELS.find((m) => m.key === result.model)!.label, target ? label(target) : ""));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="panel risk-panel">
      <div className="row">
        <label>
          Modèle
          <select value={model} onChange={(e) => setModel(e.target.value as CanRiskModel)}>
            {MODELS.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </label>
        <label>
          Calcul pour
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">— choisir —</option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>{label(p)}</option>
            ))}
          </select>
        </label>
        <label className="narrow">
          Incidences
          <input value={rates} onChange={(e) => setRates(e.target.value)} title="Taux d'incidence des cancers utilisés par le modèle (ex. UK)" />
        </label>
      </div>

      {target && (
        <div className="rf-summary small">
          Facteurs de risque{target.id === pedigree.probandId ? "" : ` (${label(target)})`} :{" "}
          {countRiskFactors(target.riskFactors) ? `${countRiskFactors(target.riskFactors)} renseigné(s)` : "aucun renseigné"}
          {target.ashkenazi ? " · ashkénaze" : ""}{" "}
          <button className="link" onClick={() => onEditInfo(target.id)}>Compléter « Info patient »</button>
        </div>
      )}

      {exp.errors.length > 0 && (
        <ul className="error">
          {exp.errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
      {exp.warnings.length > 0 && (
        <ul className="muted small">
          {exp.warnings.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}

      <div className="actions">
        <button className="primary" onClick={run} disabled={!!exp.errors.length || status === "loading"}>
          {status === "loading" ? "Calcul en cours…" : "Calculer le risque"}
        </button>
        <button onClick={download} disabled={!!exp.errors.length} title="Fichier importable dans l'outil CanRisk (canrisk.org)">Fichier CanRisk</button>
        {pr && <button onClick={copySummary}>{copied ? "Copié ✓" : "Copier pour le CR"}</button>}
      </div>
      {error && <div className="error">Calcul impossible : {error}</div>}

      {pr && result && (
        <div className={stale ? "results stale" : "results"}>
          {stale && <div className="hint small">L'arbre a changé depuis ce calcul : relancez-le.</div>}
          <RiskTable title="Risque cumulé de 20 à 80 ans" rows={pr.lifetime_cancer_risk} baseline={pr.baseline_lifetime_cancer_risk} />
          <RiskTable title="Risque entre 40 et 50 ans" rows={pr.ten_yr_cancer_risk} baseline={pr.baseline_ten_yr_cancer_risk} />
          <RiskTable title="Risque à partir de l'âge actuel" rows={pr.cancer_risks} baseline={pr.baseline_cancer_risks} />
          {!!pr.mutation_probabilties?.length && (
            <div className="risk-block">
              <div className="risk-title">Probabilité d'être porteur(se) d'un variant pathogène</div>
              <div className="carriers">
                {pr.mutation_probabilties.flatMap((m) => Object.entries(m)).map(([g, v]) => (
                  <span key={g}>
                    {g === "no mutation" ? "Aucun variant" : g} <strong>{pct(v)}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
          {!!result.data.warnings?.length && (
            <ul className="muted small">
              {result.data.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
          <div className="muted small">
            Calculé par CanRisk ({result.data.version ?? "version inconnue"}
            {result.data.cancer_incidence_rates ? `, incidences ${result.data.cancer_incidence_rates}` : ""}). Pop. = risque d'une personne de même âge dans la population générale.
          </div>
        </div>
      )}

      <details className="small muted file-preview">
        <summary>Voir le fichier envoyé à CanRisk (sans nom)</summary>
        <pre className="facts">{exp.text}</pre>
      </details>
    </div>
  );
}
