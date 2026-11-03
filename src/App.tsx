import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PedigreeView } from "./components/PedigreeView";
import { PersonPanel, type Action } from "./components/PersonPanel";
import { ReportPanel } from "./components/ReportPanel";
import { layout } from "./layout";
import { CANCER_SITES } from "./model/cancers";
import { demoPedigree } from "./model/demo";
import { buildFacts } from "./model/facts";
import {
  addChild,
  addHalfSibling,
  addParents,
  addPartner,
  addSibling,
  deletePerson,
  emptyPedigree,
  setProband,
  updatePerson,
} from "./model/ops";
import { computeRelations } from "./model/relations";
import type { Pedigree, Person } from "./model/types";

const STORE_KEY = "genus.pedigree";

function initial(): Pedigree {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return demoPedigree();
}

export default function App() {
  const [pedigree, setPedigreeRaw] = useState<Pedigree>(initial);
  const [history, setHistory] = useState<Pedigree[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(() => pedigree.probandId);
  const [zoom, setZoom] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const laid = useMemo(() => layout(pedigree), [pedigree]);
  const fit = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const z = Math.min((el.clientWidth - 20) / laid.width, (el.clientHeight - 20) / laid.height, 1.2);
    setZoom(Math.max(0.3, Math.round(z * 100) / 100));
  }, [laid]);
  // Ajuste le zoom au chargement d'un arbre
  const fittedFor = useRef<string>("");
  useEffect(() => {
    if (fittedFor.current === pedigree.probandId) return;
    fittedFor.current = pedigree.probandId;
    fit();
  }, [pedigree.probandId, fit]);

  /** Modification de l'arbre avec historique (annuler). */
  const commit = (next: Pedigree, coalesce = false) => {
    if (next === pedigree) return;
    if (!coalesce) setHistory((h) => [...h.slice(-49), pedigree]);
    setPedigreeRaw(next);
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(pedigree));
    } catch {
      /* ignore */
    }
  }, [pedigree]);

  const undo = useCallback(() => {
    if (!history.length) return;
    setPedigreeRaw(history[history.length - 1]);
    setHistory(history.slice(0, -1));
  }, [history]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  const relations = useMemo(() => computeRelations(pedigree), [pedigree]);
  const facts = useMemo(() => buildFacts(pedigree), [pedigree]);
  const selected = selectedId ? pedigree.persons[selectedId] : undefined;

  // Les frappes successives dans un même champ sont regroupées dans une seule étape d'annulation
  const lastEdit = useRef<{ id: string; keys: string; at: number } | null>(null);
  const onChange = (patch: Partial<Person>) => {
    if (!selected) return;
    const keys = Object.keys(patch).join(",");
    const now = Date.now();
    const coalesce = !!lastEdit.current && lastEdit.current.id === selected.id && lastEdit.current.keys === keys && now - lastEdit.current.at < 1500;
    lastEdit.current = { id: selected.id, keys, at: now };
    commit(updatePerson(pedigree, selected.id, patch), coalesce);
  };

  const onAction = (a: Action) => {
    if (!selected) return;
    const id = selected.id;
    const before = new Set(Object.keys(pedigree.persons));
    let next = pedigree;
    switch (a.type) {
      case "parents":
        next = addParents(pedigree, id);
        break;
      case "sibling":
        next = addSibling(pedigree, id, a.sex);
        break;
      case "halfSibling":
        next = addHalfSibling(pedigree, id, a.sex, a.via);
        break;
      case "child":
        next = addChild(pedigree, id, a.sex);
        break;
      case "partner":
        next = addPartner(pedigree, id);
        break;
      case "proband":
        next = setProband(pedigree, id);
        break;
      case "delete": {
        const n = Object.keys(deletePerson(pedigree, id).persons).length;
        const removed = Object.keys(pedigree.persons).length - n;
        if (removed > 1 && !confirm(`Cette suppression retire ${removed} personnes (branche détachée). Continuer ?`)) return;
        next = deletePerson(pedigree, id);
        setSelectedId(undefined);
        break;
      }
    }
    commit(next);
    // Sélectionne la personne ajoutée (la dernière créée), pour enchaîner la saisie
    if (a.type !== "delete" && a.type !== "proband") {
      const added = Object.keys(next.persons).filter((k) => !before.has(k));
      const focus = a.type === "child" || a.type === "sibling" || a.type === "halfSibling" ? added[added.length - 1] : added[0];
      if (focus) setSelectedId(focus);
    }
  };

  const setConsult = (patch: Partial<Pedigree["consultation"]>) =>
    commit({ ...pedigree, consultation: { ...pedigree.consultation, ...patch } }, true);

  const reset = (p: Pedigree) => {
    commit(p);
    setSelectedId(p.probandId);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(pedigree, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `arbre-${pedigree.consultation.date || "genus"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    try {
      const p = JSON.parse(await file.text()) as Pedigree;
      if (!p.persons || !p.probandId || !p.persons[p.probandId]) throw new Error("format inattendu");
      reset(p);
    } catch (e) {
      alert(`Import impossible : ${(e as Error).message}`);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">GENUS</div>
        <label className="inline">
          Date
          <input type="date" value={pedigree.consultation.date} onChange={(e) => setConsult({ date: e.target.value })} />
        </label>
        <label className="inline grow">
          Motif
          <input value={pedigree.consultation.indication} onChange={(e) => setConsult({ indication: e.target.value })} placeholder="Indication de la consultation" />
        </label>
        <label className="inline">
          Origines
          <input value={pedigree.consultation.origins ?? ""} onChange={(e) => setConsult({ origins: e.target.value })} placeholder="ex. ashkénaze" />
        </label>
        <div className="toolbar">
          <button onClick={undo} disabled={!history.length} title="Annuler (Ctrl+Z)">↶ Annuler</button>
          <button onClick={() => confirm("Commencer un nouvel arbre ? L'arbre actuel sera remplacé.") && reset(emptyPedigree())}>Nouveau</button>
          <button onClick={() => confirm("Charger la famille de démonstration ?") && reset(demoPedigree())}>Démo</button>
          <button onClick={exportJson}>Exporter</button>
          <button onClick={() => fileRef.current?.click()}>Importer</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
        </div>
      </header>

      <main className="workspace">
        <section className="tree-area">
          <div className="zoom">
            <button onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}>−</button>
            <span>{Math.round(zoom * 100)} %</span>
            <button onClick={() => setZoom((z) => Math.min(2, z + 0.1))}>+</button>
            <button onClick={fit}>Ajuster</button>
          </div>
          <div className="tree-scroll" ref={scrollRef}>
            <PedigreeView pedigree={pedigree} selectedId={selectedId} onSelect={setSelectedId} zoom={zoom} laid={laid} />
          </div>
          <div className="legend">
            {CANCER_SITES.filter((s) => Object.values(pedigree.persons).some((p) => p.cancers.some((c) => c.site === s.key))).map((s) => (
              <span key={s.key}>
                <i style={{ background: s.color }} /> {s.label}
              </span>
            ))}
            <span>● porteur variant pathogène</span>
            <span>↗P cas index</span>
          </div>
        </section>

        <aside className="side">
          {selected ? (
            <PersonPanel
              key={selected.id}
              person={selected}
              relation={relations[selected.id]}
              isProband={selected.id === pedigree.probandId}
              onChange={onChange}
              onAction={onAction}
            />
          ) : (
            <div className="panel empty">Cliquez sur une personne de l'arbre pour la compléter ou ajouter des apparentés.</div>
          )}
        </aside>

        <aside className="report">
          <ReportPanel facts={facts} />
        </aside>
      </main>
    </div>
  );
}
