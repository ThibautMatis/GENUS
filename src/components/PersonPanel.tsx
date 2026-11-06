import { CANCER_SITES } from "../model/cancers";
import { agePatch, birthYearPatch, currentYear, uid } from "../model/ops";
import { degreeLabel, type Relation } from "../model/relations";
import type { Cancer, GeneticTest, Person, Sex, TestResult } from "../model/types";

export type Action =
  | { type: "parents" }
  | { type: "sibling"; sex: Sex }
  | { type: "halfSibling"; sex: Sex; via: "father" | "mother" }
  | { type: "child"; sex: Sex }
  | { type: "partner" }
  | { type: "proband" }
  | { type: "delete" };

interface Props {
  person: Person;
  relation?: Relation;
  isProband: boolean;
  onChange: (patch: Partial<Person>) => void;
  onAction: (a: Action) => void;
}

const RESULTS: TestResult[] = ["pathogène", "probablement pathogène", "VSI", "négatif", "en cours"];

const num = (v: string): number | undefined => (v === "" ? undefined : Math.max(0, parseInt(v, 10) || 0));

export function PersonPanel({ person, relation, isProband, onChange, onAction }: Props) {
  const setCancer = (i: number, patch: Partial<Cancer>) =>
    onChange({ cancers: person.cancers.map((c, k) => (k === i ? { ...c, ...patch } : c)) });
  const setTest = (i: number, patch: Partial<GeneticTest>) =>
    onChange({ tests: person.tests.map((t, k) => (k === i ? { ...t, ...patch } : t)) });

  return (
    <div className="panel person-panel">
      <div className="panel-head">
        <div>
          <div className="relation">{isProband ? "Cas index" : relation?.label ?? "—"}</div>
          {relation && !isProband && (
            <div className="muted small">{relation.blood ? degreeLabel(relation.degree) : "par alliance"}</div>
          )}
        </div>
      </div>

      <div className="actions">
        <span className="muted small">Ajouter :</span>
        <button onClick={() => onAction({ type: "parents" })} disabled={!!(person.fatherId && person.motherId)}>Parents</button>
        <button onClick={() => onAction({ type: "sibling", sex: "M" })}>Frère</button>
        <button onClick={() => onAction({ type: "sibling", sex: "F" })}>Sœur</button>
        <button onClick={() => onAction({ type: "child", sex: "M" })}>Fils</button>
        <button onClick={() => onAction({ type: "child", sex: "F" })}>Fille</button>
        <button onClick={() => onAction({ type: "partner" })}>Conjoint</button>
        <details className="more">
          <summary>Plus…</summary>
          <div className="more-menu">
            <button onClick={() => onAction({ type: "halfSibling", sex: "M", via: "father" })}>Demi-frère paternel</button>
            <button onClick={() => onAction({ type: "halfSibling", sex: "F", via: "father" })}>Demi-sœur paternelle</button>
            <button onClick={() => onAction({ type: "halfSibling", sex: "M", via: "mother" })}>Demi-frère maternel</button>
            <button onClick={() => onAction({ type: "halfSibling", sex: "F", via: "mother" })}>Demi-sœur maternelle</button>
            <button onClick={() => onAction({ type: "sibling", sex: "U" })}>Enfant de sexe non précisé (fratrie)</button>
            {!isProband && <button onClick={() => onAction({ type: "proband" })}>Définir comme cas index</button>}
          </div>
        </details>
        <button
          className="danger"
          onClick={() => onAction({ type: "delete" })}
          disabled={isProband}
          title={isProband ? "Le cas index ne peut pas être supprimé" : "Supprimer (et les branches qui en dépendent)"}
        >
          Supprimer
        </button>
      </div>

      <fieldset>
        <legend>Identité</legend>
        <label>
          Repère (prénom / initiales)
          <input value={person.label ?? ""} onChange={(e) => onChange({ label: e.target.value })} placeholder="non transmis à l'IA" />
        </label>
        <div className="row">
          <label>
            Sexe
            <select value={person.sex} onChange={(e) => onChange({ sex: e.target.value as Sex })}>
              <option value="F">Femme</option>
              <option value="M">Homme</option>
              <option value="U">Non précisé</option>
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={person.deceased} onChange={(e) => onChange({ deceased: e.target.checked })} />
            Décédé(e)
          </label>
        </div>
        <div className="row">
          {person.deceased ? (
            <>
              <label>
                Âge au décès
                <input type="number" min={0} value={person.ageAtDeath ?? ""} onChange={(e) => onChange({ ageAtDeath: num(e.target.value) })} />
              </label>
              <label>
                Cause
                <input value={person.causeOfDeath ?? ""} onChange={(e) => onChange({ causeOfDeath: e.target.value })} />
              </label>
            </>
          ) : (
            <label>
              Âge
              <input type="number" min={0} value={person.age ?? ""} onChange={(e) => onChange(agePatch(person, num(e.target.value)))} />
            </label>
          )}
          <label>
            Année de naissance
            <input
              type="number"
              value={person.birthYear ?? ""}
              placeholder={person.deceased ? "si connue" : "calculée depuis l'âge"}
              onChange={(e) => onChange(birthYearPatch(person, num(e.target.value)))}
            />
          </label>
        </div>
        {!person.deceased && person.age != null && person.birthYear === currentYear() - person.age && (
          <div className="muted small hint-line">Année de naissance déduite de l'âge (à ± 1 an près selon la date d'anniversaire).</div>
        )}
      </fieldset>

      <fieldset>
        <legend>Cancers</legend>
        {person.cancers.map((c, i) => (
          <div key={c.id} className="item">
            <div className="row">
              <label>
                Localisation
                <input list="cancer-sites" value={c.site} onChange={(e) => setCancer(i, { site: e.target.value })} />
              </label>
              <label className="narrow">
                Âge diag.
                <input type="number" min={0} value={c.ageAtDiagnosis ?? ""} onChange={(e) => setCancer(i, { ageAtDiagnosis: num(e.target.value) })} />
              </label>
              <button className="icon" title="Retirer" onClick={() => onChange({ cancers: person.cancers.filter((_, k) => k !== i) })}>×</button>
            </div>
            <input
              className="details"
              placeholder="Précisions (histologie, latéralité, récepteurs…)"
              value={c.details ?? ""}
              onChange={(e) => setCancer(i, { details: e.target.value })}
            />
            {c.site === "sein" && (
              <div className="pathology">
                {(["ER", "PR", "HER2"] as const).map((k) => (
                  <label key={k} className="inline-select">
                    {k === "ER" ? "RE" : k === "PR" ? "RP" : "HER2"}
                    <select
                      value={c.pathology?.[k] ?? ""}
                      onChange={(e) => setCancer(i, { pathology: { ...c.pathology, [k]: (e.target.value || undefined) as "P" | "N" | undefined } })}
                    >
                      <option value="">?</option>
                      <option value="P">+</option>
                      <option value="N">−</option>
                    </select>
                  </label>
                ))}
                <label className="check small">
                  <input type="checkbox" checked={!!c.contralateral} onChange={(e) => setCancer(i, { contralateral: e.target.checked })} />
                  Controlatéral
                </label>
              </div>
            )}
          </div>
        ))}
        <div className="quick-sites">
          {CANCER_SITES.slice(0, 8).map((s) => (
            <button key={s.key} className="chip" style={{ borderColor: s.color, color: s.color }} onClick={() => onChange({ cancers: [...person.cancers, { id: uid(), site: s.key }] })}>
              + {s.label}
            </button>
          ))}
          <button className="chip" onClick={() => onChange({ cancers: [...person.cancers, { id: uid(), site: "" }] })}>+ Autre</button>
        </div>
        <datalist id="cancer-sites">
          {CANCER_SITES.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </datalist>
      </fieldset>

      <fieldset>
        <legend>Analyses génétiques</legend>
        {person.tests.map((t, i) => (
          <div key={t.id} className="item">
            <div className="row">
              <label>
                Gène / panel
                <input value={t.gene} onChange={(e) => setTest(i, { gene: e.target.value })} placeholder="BRCA1, panel HBOC…" />
              </label>
              <label>
                Résultat
                <select value={t.result} onChange={(e) => setTest(i, { result: e.target.value as TestResult })}>
                  {RESULTS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <button className="icon" title="Retirer" onClick={() => onChange({ tests: person.tests.filter((_, k) => k !== i) })}>×</button>
            </div>
            <div className="row">
              <input className="details" placeholder="Variant (HGVS)" value={t.variant ?? ""} onChange={(e) => setTest(i, { variant: e.target.value })} />
              <input className="details narrow" type="number" placeholder="Année" value={t.year ?? ""} onChange={(e) => setTest(i, { year: num(e.target.value) })} />
            </div>
            <label className="check small">
              <input type="checkbox" checked={!!t.targeted} onChange={(e) => setTest(i, { targeted: e.target.checked })} />
              Test ciblé du variant familial
            </label>
          </div>
        ))}
        <button className="chip" onClick={() => onChange({ tests: [...person.tests, { id: uid(), gene: "", result: "en cours" }] })}>+ Analyse</button>
      </fieldset>

      <fieldset>
        <legend>Autres</legend>
        <label className="check">
          <input type="checkbox" checked={!!person.unknownHistory} onChange={(e) => onChange({ unknownHistory: e.target.checked })} />
          Antécédents inconnus du consultant
        </label>
        <label className="check">
          <input type="checkbox" checked={!!person.ashkenazi} onChange={(e) => onChange({ ashkenazi: e.target.checked })} />
          Origine juive ashkénaze
        </label>
        <label className="check">
          <input type="checkbox" checked={!!person.adopted} onChange={(e) => onChange({ adopted: e.target.checked })} />
          Adopté(e)
        </label>
        <label>
          Notes (transmises à l'IA – pas de nom)
          <textarea rows={2} value={person.notes ?? ""} onChange={(e) => onChange({ notes: e.target.value })} placeholder="Autres antécédents, chirurgie prophylactique…" />
        </label>
      </fieldset>
    </div>
  );
}
