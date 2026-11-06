import { useEffect } from "react";
import { agePatch, birthYearPatch } from "../model/ops";
import type { Person, RiskFactors } from "../model/types";

interface Props {
  person: Person;
  title: string;
  onChange: (patch: Partial<Person>) => void;
  onClose: () => void;
}

const num = (v: string) => (v === "" ? undefined : Number(v));

/** Nombre de facteurs de risque renseignés (affiché dans l'onglet CanRisk). */
export function countRiskFactors(rf?: RiskFactors): number {
  return rf ? Object.values(rf).filter((v) => v !== undefined && v !== "").length : 0;
}

export function PatientInfoModal({ person, title, onChange, onClose }: Props) {
  const rf = person.riskFactors ?? {};
  const set = (patch: Partial<RiskFactors>) => onChange({ riskFactors: { ...rf, ...patch } });
  const female = person.sex === "F";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Contraception orale : N | F:années | C:années
  const [ocKind, ocYears] = (rf.ocUse ?? "").split(":");
  const setOc = (kind: string, years?: string) =>
    set({ ocUse: !kind ? undefined : kind === "N" ? "N" : `${kind}${years ? `:${years}` : ""}` });

  // Ménopause : "N" (non ménopausée) | âge
  const menoStatus = rf.menopause === undefined ? "" : rf.menopause === "N" ? "N" : "Y";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Informations patient" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="relation">Info patient</div>
            <div className="muted small">{title}</div>
          </div>
          <button className="icon" onClick={onClose} title="Fermer (Échap)">×</button>
        </div>

        <div className="modal-body">
          <section>
            <h3>Général</h3>
            <div className="rf-grid">
              <label>
                {person.deceased ? "Âge au décès" : "Âge"}
                <input
                  type="number"
                  value={(person.deceased ? person.ageAtDeath : person.age) ?? ""}
                  onChange={(e) => onChange(person.deceased ? { ageAtDeath: num(e.target.value) } : agePatch(person, num(e.target.value)))}
                />
              </label>
              <label>
                Année de naissance
                <input type="number" value={person.birthYear ?? ""} onChange={(e) => onChange(birthYearPatch(person, num(e.target.value)))} />
              </label>
              <label>Taille (cm)<input type="number" value={rf.height ?? ""} onChange={(e) => set({ height: num(e.target.value) })} /></label>
              <label>IMC (kg/m²)<input type="number" step="0.1" value={rf.bmi ?? ""} onChange={(e) => set({ bmi: num(e.target.value) })} /></label>
              <label>Alcool (g/jour)<input type="number" step="0.1" value={rf.alcohol ?? ""} onChange={(e) => set({ alcohol: num(e.target.value) })} title="1 verre standard ≈ 10 g" /></label>
            </div>
            <label className="check">
              <input type="checkbox" checked={!!person.ashkenazi} onChange={(e) => onChange({ ashkenazi: e.target.checked })} />
              Origine juive ashkénaze
            </label>
          </section>

          {female && (
            <>
              <section>
                <h3>Vie hormonale</h3>
                <div className="rf-grid">
                  <label>Âge des premières règles<input type="number" value={rf.menarche ?? ""} onChange={(e) => set({ menarche: num(e.target.value) })} /></label>
                  <label>Nombre d'enfants<input type="number" min={0} value={rf.parity ?? ""} onChange={(e) => set({ parity: num(e.target.value) })} /></label>
                  <label>Âge au premier enfant<input type="number" value={rf.firstLiveBirth ?? ""} onChange={(e) => set({ firstLiveBirth: num(e.target.value) })} disabled={rf.parity === 0} /></label>
                  <label>
                    Ménopause
                    <select
                      value={menoStatus}
                      onChange={(e) => set({ menopause: e.target.value === "" ? undefined : e.target.value === "N" ? "N" : "" })}
                    >
                      <option value="">—</option>
                      <option value="N">Non ménopausée</option>
                      <option value="Y">Ménopausée</option>
                    </select>
                  </label>
                  {menoStatus === "Y" && (
                    <label>Âge à la ménopause<input type="number" value={rf.menopause ?? ""} onChange={(e) => set({ menopause: e.target.value })} /></label>
                  )}
                </div>
              </section>

              <section>
                <h3>Traitements hormonaux</h3>
                <div className="rf-grid">
                  <label>
                    Contraception orale
                    <select value={ocKind ?? ""} onChange={(e) => setOc(e.target.value, ocYears)}>
                      <option value="">—</option>
                      <option value="N">Jamais</option>
                      <option value="F">Ancienne</option>
                      <option value="C">Actuelle</option>
                    </select>
                  </label>
                  {(ocKind === "F" || ocKind === "C") && (
                    <label>Durée (années)<input type="number" value={ocYears ?? ""} onChange={(e) => setOc(ocKind, e.target.value)} /></label>
                  )}
                  <label>
                    Traitement hormonal de la ménopause
                    <select value={rf.mhtUse ?? ""} onChange={(e) => set({ mhtUse: (e.target.value || undefined) as RiskFactors["mhtUse"] })}>
                      <option value="">—</option>
                      <option value="N">Jamais</option>
                      <option value="F">Ancien</option>
                      <option value="E">Actuel – œstrogènes seuls</option>
                      <option value="C">Actuel – combiné / autre</option>
                    </select>
                  </label>
                </div>
              </section>

              <section>
                <h3>Sein et gynécologie</h3>
                <div className="rf-grid">
                  <label>
                    Densité mammaire (BI-RADS)
                    <select value={rf.birads ?? ""} onChange={(e) => set({ birads: (e.target.value || undefined) as RiskFactors["birads"] })}>
                      <option value="">—</option>
                      <option value="a">a – graisseuse</option>
                      <option value="b">b – fibroglandulaire dispersée</option>
                      <option value="c">c – hétérogène dense</option>
                      <option value="d">d – extrêmement dense</option>
                    </select>
                  </label>
                  <label>
                    Ligature des trompes
                    <select value={rf.tubalLigation ?? ""} onChange={(e) => set({ tubalLigation: (e.target.value || undefined) as "Y" | "N" })}>
                      <option value="">—</option><option value="Y">Oui</option><option value="N">Non</option>
                    </select>
                  </label>
                  <label>
                    Endométriose
                    <select value={rf.endometriosis ?? ""} onChange={(e) => set({ endometriosis: (e.target.value || undefined) as "Y" | "N" })}>
                      <option value="">—</option><option value="Y">Oui</option><option value="N">Non</option>
                    </select>
                  </label>
                </div>
              </section>
            </>
          )}
          <p className="muted small">
            Ces informations sont optionnelles et servent au calcul CanRisk. Elles ne figurent pas sur l'arbre.
          </p>
        </div>
        <div className="modal-foot">
          <button className="primary" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
