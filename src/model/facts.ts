import { cancerLabel } from "./cancers";
import { partnersOf } from "./ops";
import { computeRelations, degreeLabel, type Relation } from "./relations";
import type { Pedigree, Person } from "./types";

/**
 * Données PSEUDONYMISÉES envoyées à l'IA : aucun prénom, aucune date de naissance
 * complète. Seuls le lien de parenté, l'âge et les antécédents sont transmis.
 */
export type Branch = "cas index" | "conjoint et descendance" | "fratrie" | "branche paternelle" | "branche maternelle" | "autre";

export interface PersonFact {
  relation: string;
  degree?: string;
  branch: Branch;
  sex: "homme" | "femme" | "non précisé";
  status: string;
  cancers: string[];
  tests: string[];
  notes?: string;
}

export interface ReportFacts {
  consultation: { date: string; indication: string; origins?: string; notes?: string };
  proband: PersonFact;
  relatives: PersonFact[];
}

const BRANCH_ORDER: Branch[] = [
  "cas index",
  "conjoint et descendance",
  "fratrie",
  "branche paternelle",
  "branche maternelle",
  "autre",
];

export function branchOf(p: Pedigree, id: string, rels: Record<string, Relation>, depth = 0): Branch {
  const r = rels[id];
  if (id === p.probandId) return "cas index";
  if (r.blood && /^(demi-)?(frère|sœur|membre de la fratrie)/.test(r.label)) return "fratrie";
  if (r.side === "paternelle") return "branche paternelle";
  if (r.side === "maternelle") return "branche maternelle";
  if (!r.blood) {
    // Par alliance : on le range avec son/sa conjoint(e) apparenté(e)
    const partner = partnersOf(p, id).find((x) => rels[x]?.blood);
    if (!partner || depth > 2) return "autre";
    if (partner === p.probandId) return "conjoint et descendance";
    return branchOf(p, partner, rels, depth + 1);
  }
  // Sans branche : descendants du cas index, ou fratrie et sa descendance
  const isDescendant = /^(fils|fille|enfant|petit|arrière-petit|descendant)/.test(r.label);
  return isDescendant ? "conjoint et descendance" : "fratrie";
}

function sexLabel(p: Person): PersonFact["sex"] {
  return p.sex === "M" ? "homme" : p.sex === "F" ? "femme" : "non précisé";
}

function statusOf(p: Person): string {
  const e = p.sex === "F" ? "e" : "";
  if (p.deceased) {
    let s = `décédé${e}`;
    if (p.ageAtDeath != null) s += ` à ${p.ageAtDeath} ans`;
    if (p.causeOfDeath) s += ` (${p.causeOfDeath})`;
    return s;
  }
  if (p.age != null) return `vivant${e}, ${p.age} ans`;
  if (p.birthYear) return `vivant${e}, né${e} en ${p.birthYear}`;
  return `vivant${e}, âge non renseigné`;
}

export function buildFacts(p: Pedigree): ReportFacts {
  const rels = computeRelations(p);
  const toFact = (person: Person): PersonFact => {
    const r = rels[person.id];
    const notes = [person.notes, person.adopted ? "adopté(e)" : "", person.unknownHistory ? "antécédents inconnus du consultant" : ""]
      .filter(Boolean)
      .join(" ; ");
    return {
      relation: r.label,
      degree: r.blood && r.degree ? degreeLabel(r.degree) : r.blood ? undefined : "par alliance",
      branch: branchOf(p, person.id, rels),
      sex: sexLabel(person),
      status: statusOf(person),
      cancers: person.cancers.map(
        (c) =>
          `${cancerLabel(c.site)}${c.ageAtDiagnosis != null ? ` à ${c.ageAtDiagnosis} ans` : " (âge au diagnostic inconnu)"}${c.details ? ` – ${c.details}` : ""}`,
      ),
      tests: person.tests.map(
        (t) => `${t.gene} : ${t.result}${t.variant ? ` (${t.variant})` : ""}${t.year ? `, ${t.year}` : ""}`,
      ),
      notes: notes || undefined,
    };
  };

  const relatives = Object.values(p.persons)
    .filter((x) => x.id !== p.probandId)
    .map(toFact)
    .sort(
      (x, y) =>
        BRANCH_ORDER.indexOf(x.branch) - BRANCH_ORDER.indexOf(y.branch) ||
        (parseInt(x.degree ?? "99") || 99) - (parseInt(y.degree ?? "99") || 99),
    );

  return {
    consultation: {
      date: p.consultation.date,
      indication: p.consultation.indication,
      origins: p.consultation.origins || undefined,
      notes: p.consultation.notes || undefined,
    },
    proband: toFact(p.persons[p.probandId]),
    relatives,
  };
}
