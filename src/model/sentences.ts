/**
 * CR « hors-ligne » (sans IA) : une phrase complète par personne, regroupées par branche.
 * Exemple : « Sa mère, décédée à 55 ans, a présenté un cancer du sein à 47 ans (sein gauche, triple négatif). »
 */
import { branchOf, type Branch } from "./facts";
import { computeRelations } from "./relations";
import type { Cancer, GeneticTest, Pedigree, Person } from "./types";

const CANCER_PHRASES: Record<string, string> = {
  sein: "un cancer du sein",
  ovaire: "un cancer de l'ovaire",
  colorectal: "un cancer colorectal",
  endomètre: "un cancer de l'endomètre",
  prostate: "un cancer de la prostate",
  pancréas: "un cancer du pancréas",
  estomac: "un cancer de l'estomac",
  mélanome: "un mélanome",
  rein: "un cancer du rein",
  "voies urinaires": "un cancer des voies urinaires",
  thyroïde: "un cancer de la thyroïde",
  poumon: "un cancer du poumon",
  hémopathie: "une hémopathie maligne",
  sarcome: "un sarcome",
  cerveau: "une tumeur cérébrale",
};

const FEMININE_START = /^(leucémie|tumeur|hémopathie|maladie|néoplasie|myélodysplasie|lésion|dysplasie|polypose)/i;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const e = (p: Person) => (p.sex === "F" ? "e" : p.sex === "U" ? "(e)" : "");

/** « un cancer du sein », ou texte libre précédé de un / une / d'un cancer selon le cas. */
function cancerName(c: Cancer): string {
  if (CANCER_PHRASES[c.site]) {
    const base = CANCER_PHRASES[c.site];
    return c.contralateral && c.site === "sein" ? "un cancer du sein controlatéral" : base;
  }
  const t = (c.site || "cancer de localisation non précisée").trim().toLowerCase();
  if (/^(un|une|des|le|la|l')\s/.test(t)) return t;
  if (/^(cancer|carcinome|adénocarcinome|lymphome|myélome|mélanome|sarcome|gliome|neuroblastome)/.test(t)) return `un ${t}`;
  return FEMININE_START.test(t) ? `une ${t}` : `un cancer ${/^[aeéèêiouyh]/.test(t) ? "d'" : "de "}${t}`;
}

const PATHO = { ER: "RE", PR: "RP", HER2: "HER2", CK14: "CK14", CK56: "CK5/6" } as const;

function cancerPhrase(c: Cancer): string {
  let s = cancerName(c);
  s += c.ageAtDiagnosis != null ? ` à ${c.ageAtDiagnosis} ans` : " à un âge non précisé";
  const extras: string[] = [];
  if (c.details) extras.push(c.details.trim());
  const patho = Object.entries(c.pathology ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${PATHO[k as keyof typeof PATHO]}${v === "P" ? "+" : "−"}`)
    .join(", ");
  if (patho && !/RE|RP|HER2|RH/i.test(c.details ?? "")) extras.push(patho);
  if (extras.length) s += ` (${extras.join(" ; ")})`;
  return s;
}

function listFr(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

function testSentence(t: GeneticTest): string {
  const what = `${t.targeted ? "Un test ciblé" : "Une analyse"} ${t.gene ? `de ${t.gene}` : "génétique"}${t.year ? ` (${t.year})` : ""}`;
  const variant = t.variant ? ` (${t.variant})` : "";
  switch (t.result) {
    case "pathogène":
      return `${what} a mis en évidence un variant pathogène${variant}.`;
    case "probablement pathogène":
      return `${what} a mis en évidence un variant probablement pathogène${variant}.`;
    case "VSI":
      return `${what} a identifié un variant de signification inconnue${variant}.`;
    case "négatif":
      return `${what} n'a pas mis en évidence de variant pathogène.`;
    default:
      return `${what} est en cours.`;
  }
}

/** Sujet de la phrase : « La consultante », « Sa mère », « Son oncle paternel », « Le conjoint de la tante… ». */
function subject(p: Person, relation: string, isProband: boolean): string {
  if (isProband) return p.sex === "F" ? "La consultante" : p.sex === "M" ? "Le consultant" : "Le/la consultant(e)";
  if (/^conjoint(e)? (de|du|des)\b/.test(relation)) return cap(`${p.sex === "F" ? "la" : "le"} ${relation}`);
  const possessive = /^[aeéèêiouyh]/i.test(relation) || p.sex !== "F" ? "son" : "sa";
  return cap(`${possessive} ${relation}`);
}

function vital(p: Person): string {
  if (p.deceased) {
    const age = p.ageAtDeath != null ? ` à ${p.ageAtDeath} ans` : "";
    const cause = p.causeOfDeath ? ` (${p.causeOfDeath})` : "";
    return `décédé${e(p)}${age}${cause}`;
  }
  if (p.age != null) return `âgé${e(p)} de ${p.age} ans`;
  if (p.birthYear) return `né${e(p)} en ${p.birthYear}`;
  return "";
}

/** Phrase(s) décrivant une personne. */
export function personSentence(p: Person, relation: string, isProband: boolean): string {
  const subj = subject(p, relation, isProband);
  const v = vital(p);
  const head = v ? `${subj}, ${v},` : subj;
  const pronoun = p.sex === "F" ? "Elle" : p.sex === "M" ? "Il" : "Il/elle";
  const sentences: string[] = [];

  if (p.unknownHistory && !p.cancers.length) sentences.push(`${head} a des antécédents inconnus du consultant.`);
  else if (p.cancers.length) sentences.push(`${head} a présenté ${listFr(p.cancers.map(cancerPhrase))}.`);
  else sentences.push(`${head} n'a pas d'antécédent de cancer connu.`);

  if (p.ashkenazi) sentences.push(`${pronoun} est d'origine juive ashkénaze.`);
  if (p.adopted) sentences.push(`${pronoun} a été adopté${e(p)}.`);
  for (const t of p.tests) sentences.push(testSentence(t));
  if (p.notes?.trim()) {
    const n = cap(p.notes.trim());
    sentences.push(/[.!?]$/.test(n) ? n : `${n}.`);
  }
  return sentences.join(" ");
}

const BRANCH_TITLES: Record<Branch, string> = {
  "cas index": "Cas index",
  "conjoint et descendance": "Conjoint et descendance",
  fratrie: "Fratrie",
  "branche paternelle": "Branche paternelle",
  "branche maternelle": "Branche maternelle",
  autre: "Autres apparentés",
};

/** CR complet par modèles de phrases : un point par personne, regroupés par branche. */
export function templateReport(p: Pedigree): string {
  const rels = computeRelations(p);
  const out: string[] = ["HISTOIRE FAMILIALE"];
  if (p.consultation.indication) out.push(`Motif de consultation : ${p.consultation.indication.trim().replace(/\.$/, "")}.`);
  if (p.consultation.origins) out.push(`Origines : ${p.consultation.origins.trim().replace(/\.$/, "")}.`);

  const ids = Object.keys(p.persons);
  for (const b of Object.keys(BRANCH_TITLES) as Branch[]) {
    const inBranch = ids
      .filter((id) => branchOf(p, id, rels) === b)
      // degré de parenté croissant ; apparentés par alliance à la fin
      .sort((a, c) => (rels[a].degree ?? 9) - (rels[c].degree ?? 9));
    if (!inBranch.length) continue;
    out.push("", BRANCH_TITLES[b]);
    for (const id of inBranch) out.push(`- ${personSentence(p.persons[id], rels[id].label, id === p.probandId)}`);
  }
  return out.join("\n");
}
