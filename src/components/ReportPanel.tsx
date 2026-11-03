import { useCallback, useEffect, useRef, useState } from "react";
import { templateReport, type ReportFacts } from "../model/facts";

interface Props {
  facts: ReportFacts;
}

type Status = "idle" | "generating" | "error";

const STYLE_KEY = "genus.styleExample";
const AUTO_KEY = "genus.auto";

function load(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* stockage indisponible */
  }
}

export function ReportPanel({ facts }: Props) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [edited, setEdited] = useState(false);
  const [auto, setAuto] = useState(load(AUTO_KEY, "1") === "1");
  const [styleExample, setStyleExample] = useState(load(STYLE_KEY, ""));
  const [showSettings, setShowSettings] = useState(false);
  const [showFacts, setShowFacts] = useState(false);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const factsJson = JSON.stringify(facts);
  const lastGenerated = useRef<string>("");

  const generate = useCallback(
    async (force = false) => {
      if (edited && !force) return;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      lastGenerated.current = factsJson;
      setStatus("generating");
      setError("");
      setEdited(false);
      try {
        const res = await fetch("/api/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ facts: JSON.parse(factsJson), styleExample }),
          signal: ctrl.signal,
        });
        if (res.status === 503 || res.status === 404 || res.status === 502) {
          // Pas de clé API / serveur absent : CR par modèle de phrases
          setOffline(true);
          setText(templateReport(JSON.parse(factsJson)));
          setStatus("idle");
          return;
        }
        if (!res.ok || !res.body) throw new Error((await res.text()) || `Erreur ${res.status}`);
        setOffline(false);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let acc = "";
        setText("");
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          setText(acc);
        }
        setStatus("idle");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setOffline(true);
        setText(templateReport(JSON.parse(factsJson)));
        setError(`Génération IA indisponible (${(e as Error).message}). CR généré par modèle de phrases.`);
        setStatus("error");
      }
    },
    [factsJson, styleExample, edited],
  );

  // Génération automatique, avec délai pour ne pas appeler l'IA à chaque frappe
  useEffect(() => {
    if (!auto || edited || factsJson === lastGenerated.current) return;
    const t = setTimeout(() => generate(), 1800);
    return () => clearTimeout(t);
  }, [factsJson, auto, edited, generate]);

  const regenerate = () => {
    if (edited && !confirm("Le CR a été modifié à la main. Regénérer écrasera vos modifications. Continuer ?")) return;
    generate(true);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const stale = factsJson !== lastGenerated.current;

  return (
    <div className="panel report-panel">
      <div className="report-toolbar">
        <strong>Compte rendu</strong>
        <span className={`status ${status}`}>
          {status === "generating" ? "Rédaction en cours…" : edited ? "Modifié à la main" : stale && text ? "Arbre modifié depuis" : offline ? "Mode hors-ligne" : text ? "À jour" : ""}
        </span>
        <span className="spacer" />
        <label className="check small" title="Regénère automatiquement quand l'arbre change (sauf si le CR a été modifié à la main)">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => {
              setAuto(e.target.checked);
              save(AUTO_KEY, e.target.checked ? "1" : "0");
            }}
          />
          Auto
        </label>
        <button onClick={regenerate} disabled={status === "generating"}>Regénérer</button>
        <button onClick={copy} disabled={!text}>{copied ? "Copié ✓" : "Copier"}</button>
        <button className="icon" title="Réglages" onClick={() => setShowSettings((v) => !v)}>⚙</button>
      </div>

      {showSettings && (
        <div className="settings">
          <label>
            Exemple de CR (style à imiter, anonymisé)
            <textarea
              rows={6}
              value={styleExample}
              onChange={(e) => {
                setStyleExample(e.target.value);
                save(STYLE_KEY, e.target.value);
              }}
              placeholder="Collez ici la partie « histoire familiale » d'un CR type, anonymisée. L'IA en reprendra la structure et le ton."
            />
          </label>
          <button className="link" onClick={() => setShowFacts((v) => !v)}>
            {showFacts ? "Masquer" : "Voir"} les données transmises à l'IA
          </button>
          {showFacts && <pre className="facts">{JSON.stringify(facts, null, 2)}</pre>}
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <textarea
        className="report-text"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setEdited(true);
          abortRef.current?.abort();
          setStatus("idle");
        }}
        placeholder="Le compte rendu apparaîtra ici au fur et à mesure de la saisie de l'arbre. Il reste entièrement modifiable."
      />
      <div className="muted small footnote">
        Brouillon généré automatiquement à partir de l'arbre : à relire et valider par le clinicien.
      </div>
    </div>
  );
}
