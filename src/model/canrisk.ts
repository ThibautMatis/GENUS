import type { GeneticTest, Pedigree, Person, RiskFactors } from "./types";

/**
 * Conversion de l'arbre GENUS au format « CanRisk Pedigree Data v4 »
 * (spécification : https://canrisk.atlassian.net/wiki/spaces/FAQS/pages/2749661185).
 * Les noms ne sont jamais exportés : chaque personne reçoit un identifiant numérique.
 */

export const CANRISK_GENES = ["BRCA1", "BRCA2", "PALB2", "ATM", "CHEK2", "BARD1", "RAD51D", "RAD51C", "BRIP1", "HOXB13"] as const;

const COLUMNS = [
  "FamID", "Name", "Target", "IndivID", "FathID", "MothID", "Sex", "MZtwin", "Dead", "Age", "Yob",
  "BC1", "BC2", "OC", "PRO", "PAN", "Ashkn", ...CANRISK_GENES, "ER:PR:HER2:CK14:CK56",
];

export type CanRiskModel = "boadicea" | "ovarian" | "prostate";

export interface CanRiskExport {
  text: string;
  /** Problèmes bloquants pour le calcul */
  errors: string[];
  /** Approximations faites lors de l'export */
  warnings: string[];
}

const thisYear = () => new Date().getFullYear();

function ageOf(p: Person): number | undefined {
  if (p.deceased) return p.ageAtDeath;
  if (p.age != null) return p.age;
  if (p.birthYear) return thisYear() - p.birthYear;
  return undefined;
}

function yobOf(p: Person): number | undefined {
  if (p.birthYear) return p.birthYear;
  if (!p.deceased && p.age != null) return thisYear() - p.age;
  return undefined;
}

const diag = (age: number | undefined) => (age == null ? "AU" : String(age));

function geneColumn(gene: string, tests: GeneticTest[]): string {
  const t = tests.find((x) =>
    x.gene
      .toUpperCase()
      .split(/[\s,;/+]+/)
      .includes(gene),
  );
  if (!t) return "0:0";
  const type = t.targeted ? "T" : "S";
  const positive = t.result === "pathogène" || t.result === "probablement pathogène";
  if (gene === "HOXB13") {
    if (positive) return "T:HET";
    if (t.result === "négatif") return "T:N";
    return "0:0";
  }
  if (positive) return `${type}:P`;
  if (t.result === "négatif") return `${type}:N`;
  return "0:0"; // VSI ou en cours : considéré comme non testé
}

function riskFactorHeader(rf: RiskFactors | undefined): string[] {
  if (!rf) return [];
  const out: string[] = [];
  const add = (k: string, v: unknown) => {
    if (v !== undefined && v !== "" && v !== null) out.push(`##${k}=${v}`);
  };
  add("Menarche", rf.menarche);
  add("Parity", rf.parity);
  add("First_live_birth", rf.firstLiveBirth);
  add("OC_use", rf.ocUse);
  add("MHT_use", rf.mhtUse);
  add("BMI", rf.bmi);
  add("Alcohol", rf.alcohol);
  add("Menopause", rf.menopause);
  add("BIRADS", rf.birads);
  add("Height", rf.height);
  add("TL", rf.tubalLigation);
  add("Endo", rf.endometriosis);
  return out;
}

export function toCanRisk(p: Pedigree, targetId: string, model: CanRiskModel = "boadicea"): CanRiskExport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const persons = Object.values(p.persons);
  const target = p.persons[targetId];

  // Identifiants courts (7 caractères max)
  const ids = new Map<string, string>();
  persons.forEach((x, i) => ids.set(x.id, String(i + 1)));
  let extra = persons.length;
  const virtualParents = new Map<string, string>();
  const ignored: string[] = [];

  // Validation de la cible
  if (!target) errors.push("Aucune personne cible sélectionnée.");
  else {
    if (model === "prostate" && target.sex !== "M") errors.push("Le modèle prostate s'applique à un homme.");
    if (model !== "prostate" && target.sex !== "F") errors.push("Les modèles sein et ovaire s'appliquent à une femme : choisissez une cible de sexe féminin.");
    if (ageOf(target) == null) errors.push("L'âge de la personne cible est requis.");
    if (target.deceased) errors.push("La personne cible doit être vivante.");
  }

  const rows: string[][] = [];
  const pushRow = (cols: (string | number)[]) => rows.push(cols.map(String));

  for (const x of persons) {
    if (x.sex === "U") {
      errors.push(`Une personne (${x.label || "sans repère"}) a un sexe non précisé : CanRisk exige M ou F.`);
      continue;
    }
    let fath = x.fatherId && p.persons[x.fatherId] ? ids.get(x.fatherId)! : "0";
    let moth = x.motherId && p.persons[x.motherId] ? ids.get(x.motherId)! : "0";
    // CanRisk exige 0 ou 2 parents : on crée le parent manquant (non atteint), partagé par la fratrie
    if ((fath === "0") !== (moth === "0")) {
      const known = fath === "0" ? moth : fath;
      let id = virtualParents.get(known);
      if (!id) {
        id = String(++extra);
        virtualParents.set(known, id);
        pushRow(["GENUS", id, 0, id, 0, 0, fath === "0" ? "M" : "F", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...CANRISK_GENES.map(() => "0:0"), "0:0:0:0:0"]);
        warnings.push(`Parent manquant ajouté automatiquement (sans antécédent) pour ${x.label || "une personne"}.`);
      }
      if (fath === "0") fath = id;
      else moth = id;
    }

    const breast = x.cancers
      .filter((c) => c.site === "sein")
      .sort((a, b) => (a.ageAtDiagnosis ?? 999) - (b.ageAtDiagnosis ?? 999));
    const first = breast.find((c) => !c.contralateral) ?? breast[0];
    const second = breast.find((c) => c !== first && c.contralateral);
    if (breast.length > 1 && !second)
      warnings.push(`${x.label || "Une personne"} a plusieurs cancers du sein non marqués « controlatéral » : seul le premier est transmis.`);
    const site = (s: string) => x.cancers.find((c) => c.site === s);
    const oc = x.sex === "F" ? site("ovaire") : undefined;
    const pro = x.sex === "M" ? site("prostate") : undefined;
    const pan = site("pancréas");
    const path = first?.pathology ?? {};
    const pathCol = (["ER", "PR", "HER2", "CK14", "CK56"] as const).map((k) => path[k] ?? "0").join(":");

    for (const c of x.cancers)
      if (!["sein", "ovaire", "prostate", "pancréas"].includes(c.site) && !ignored.includes(c.site)) ignored.push(c.site || "autre");

    const age = ageOf(x);
    const yob = yobOf(x);
    pushRow([
      "GENUS",
      ids.get(x.id)!,
      x.id === targetId ? 1 : 0,
      ids.get(x.id)!,
      fath,
      moth,
      x.sex,
      0,
      x.deceased ? 1 : 0,
      age ?? 0,
      yob ?? 0,
      first ? diag(first.ageAtDiagnosis) : 0,
      second ? diag(second.ageAtDiagnosis) : 0,
      oc ? diag(oc.ageAtDiagnosis) : 0,
      pro ? diag(pro.ageAtDiagnosis) : 0,
      pan ? diag(pan.ageAtDiagnosis) : 0,
      x.ashkenazi ? 1 : 0,
      ...CANRISK_GENES.map((g) => geneColumn(g, x.tests)),
      pathCol,
    ]);
  }

  if (ignored.length) warnings.push(`Non pris en compte par CanRisk : ${ignored.join(", ")}.`);
  const header = ["##CanRisk 4.0", ...riskFactorHeader(target?.riskFactors), "##" + COLUMNS.join("\t")];
  return { text: [...header, ...rows.map((r) => r.join("\t"))].join("\n") + "\n", errors, warnings };
}

/* ---------- Résultats renvoyés par l'API CanRisk ---------- */

export interface RiskValue {
  decimal: number;
  percent: number;
}
export interface RiskRow {
  age: number;
  [cancer: string]: RiskValue | number;
}

export interface PedigreeResult {
  family_id: string;
  proband_id: string;
  cancer_risks?: RiskRow[];
  baseline_cancer_risks?: RiskRow[];
  lifetime_cancer_risk?: RiskRow[];
  baseline_lifetime_cancer_risk?: RiskRow[];
  ten_yr_cancer_risk?: RiskRow[];
  baseline_ten_yr_cancer_risk?: RiskRow[];
  mutation_probabilties?: Record<string, RiskValue>[];
}

export interface CanRiskResult {
  version?: string;
  timestamp?: string;
  cancer_incidence_rates?: string;
  pedigree_result?: PedigreeResult[];
  warnings?: string[];
}

/** Libellés des cancers présents dans une ligne de résultat (ex. "breast cancer risk"). */
export function riskKeys(rows: RiskRow[] | undefined): string[] {
  const keys = new Set<string>();
  for (const r of rows ?? []) for (const k of Object.keys(r)) if (k !== "age") keys.add(k);
  return [...keys];
}

export const RISK_LABELS: Record<string, string> = {
  "breast cancer risk": "Sein",
  "ovarian cancer risk": "Ovaire",
  "prostate cancer risk": "Prostate",
};

export function pct(v: RiskValue | number | undefined): string {
  if (v == null || typeof v === "number") return "–";
  return `${v.percent.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}
