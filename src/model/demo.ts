import { currentYear, newPerson, uid } from "./ops";
import type { Pedigree, Person } from "./types";

/** Famille FICTIVE de démonstration (contexte sein-ovaire). */
export function demoPedigree(): Pedigree {
  // L'année de naissance est déduite de l'âge, comme lors de la saisie
  const P = (sex: Person["sex"], extra: Partial<Person> = {}) =>
    newPerson(sex, { ...extra, ...(extra.age != null && !extra.birthYear ? { birthYear: currentYear() - extra.age } : {}) });
  const c = (site: string, ageAtDiagnosis?: number, details?: string) => ({ id: uid(), site, ageAtDiagnosis, details });

  // Grands-parents
  const gpp = P("M", { label: "GP pat.", deceased: true, ageAtDeath: 78, cancers: [c("prostate", 72)] });
  const gmp = P("F", { label: "GM pat.", deceased: true, ageAtDeath: 85 });
  const gpm = P("M", { label: "GP mat.", deceased: true, ageAtDeath: 70, causeOfDeath: "infarctus" });
  const gmm = P("F", { label: "GM mat.", deceased: true, ageAtDeath: 62, cancers: [c("sein", 58)] });

  // Parents, oncles et tantes
  const father = P("M", { label: "Père", age: 66, fatherId: gpp.id, motherId: gmp.id });
  const uncleP = P("M", { label: "Oncle pat.", age: 70, fatherId: gpp.id, motherId: gmp.id, cancers: [c("colorectal", 68)] });
  const mother = P("F", {
    label: "Mère",
    deceased: true,
    ageAtDeath: 55,
    fatherId: gpm.id,
    motherId: gmm.id,
    cancers: [{ ...c("sein", 47, "sein gauche, triple négatif"), pathology: { ER: "N", PR: "N", HER2: "N" } }],
  });
  const auntM = P("F", { label: "Tante mat.", age: 60, fatherId: gpm.id, motherId: gmm.id, cancers: [c("ovaire", 54, "séreux de haut grade")] });
  const auntMhusband = P("M", { label: "Époux tante" });
  const cousinM = P("F", { label: "Cousine mat.", age: 34, fatherId: auntMhusband.id, motherId: auntM.id });

  // Fratrie et cas index
  const proband = P("F", {
    label: "Cas index",
    age: 39,
    fatherId: father.id,
    motherId: mother.id,
    cancers: [{ ...c("sein", 37, "carcinome canalaire infiltrant, RH+ HER2-"), pathology: { ER: "P", PR: "P", HER2: "N" } }],
  });
  const sister = P("F", { label: "Sœur", age: 35, fatherId: father.id, motherId: mother.id });
  const brother = P("M", { label: "Frère", age: 42, fatherId: father.id, motherId: mother.id });

  // Conjoint et enfants
  const husband = P("M", { label: "Conjoint", age: 41 });
  const daughter = P("F", { label: "Fille", age: 10, fatherId: husband.id, motherId: proband.id });
  const son = P("M", { label: "Fils", age: 7, fatherId: husband.id, motherId: proband.id });

  const all = [gpp, gmp, gpm, gmm, father, uncleP, mother, auntM, auntMhusband, cousinM, proband, sister, brother, husband, daughter, son];
  const couple = (a: Person, b: Person) => ({ id: uid(), a: a.id, b: b.id });

  return {
    persons: Object.fromEntries(all.map((p) => [p.id, p])),
    couples: [couple(gpp, gmp), couple(gpm, gmm), couple(father, mother), couple(auntMhusband, auntM), couple(husband, proband)],
    probandId: proband.id,
    consultation: {
      date: new Date().toISOString().slice(0, 10),
      indication: "Cancer du sein à 37 ans chez la consultante, antécédents familiaux de cancers du sein et de l'ovaire",
      origins: "",
    },
  };
}
