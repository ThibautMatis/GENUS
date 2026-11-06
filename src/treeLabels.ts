import { cancerColor, cancerLabel } from "./model/cancers";
import type { Person } from "./model/types";

export interface LabelLine {
  text: string;
  color?: string;
  bold?: boolean;
  /** texte secondaire (plus petit, en gris) */
  small?: boolean;
}

/** Largeur maximale d'une ligne sous un symbole (en caractères) */
const MAX_CHARS = 20;
/** Nombre maximal de lignes pour un texte libre */
const MAX_WRAPPED = 3;

/** Coupe un texte en lignes courtes, mot par mot ; « … » si le texte est trop long. */
export function wrap(text: string, maxChars = MAX_CHARS, maxLines = MAX_WRAPPED): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w0 of words) {
    let w = w0;
    // mot plus long qu'une ligne : coupé
    while (w.length > maxChars) {
      if (cur) (lines.push(cur), (cur = ""));
      lines.push(w.slice(0, maxChars - 1) + "-");
      w = w.slice(maxChars - 1);
    }
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= maxChars) cur += " " + w;
    else (lines.push(cur), (cur = w));
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].slice(0, maxChars - 1).trimEnd() + "…";
    return kept;
  }
  return lines;
}

const PATHO_LABELS = { ER: "RE", PR: "RP", HER2: "HER2", CK14: "CK14", CK56: "CK5/6" } as const;

/** Lignes de texte affichées sous le symbole d'une personne. */
export function labelLines(person: Person, showDetails: boolean): LabelLine[] {
  const lines: LabelLine[] = [];
  if (person.label) lines.push({ text: person.label, color: "var(--muted)" });
  if (person.deceased) lines.push({ text: `† ${person.ageAtDeath != null ? person.ageAtDeath + " a" : ""}`.trim() });
  else if (person.age != null) lines.push({ text: `${person.age} a` });
  else if (person.birthYear) lines.push({ text: `n. ${person.birthYear}` });

  for (const c of person.cancers) {
    const color = cancerColor(c.site);
    const name = cancerLabel(c.site) || "Cancer";
    const head = `${name}${c.contralateral ? " controlat." : ""}${c.ageAtDiagnosis != null ? " " + c.ageAtDiagnosis : ""}`;
    wrap(head, MAX_CHARS, 2).forEach((t) => lines.push({ text: t, color, bold: true }));
    if (!showDetails) continue;
    // Type / précisions saisies, puis récepteurs s'ils ne figurent pas déjà dans le texte
    if (c.details) wrap(c.details).forEach((t) => lines.push({ text: t, color, small: true }));
    const patho = Object.entries(c.pathology ?? {})
      .filter(([, v]) => v)
      .map(([k, v]) => `${PATHO_LABELS[k as keyof typeof PATHO_LABELS]}${v === "P" ? "+" : "−"}`)
      .join(" ");
    if (patho && !(c.details ?? "").match(/RE|RP|HER2|RH/i)) lines.push({ text: patho, color, small: true });
  }

  for (const t of person.tests) {
    const sign =
      t.result === "pathogène" || t.result === "probablement pathogène" ? "+" : t.result === "négatif" ? "−" : t.result === "VSI" ? " VSI" : " ?";
    if (t.gene) lines.push({ text: `${t.gene}${sign}`, bold: sign === "+" });
  }

  if (showDetails && person.notes) wrap(person.notes, MAX_CHARS, 4).forEach((t) => lines.push({ text: t, color: "var(--muted)", small: true }));
  return lines;
}
