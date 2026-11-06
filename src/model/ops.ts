import type { Couple, Pedigree, Person, Sex } from "./types";

export const currentYear = () => new Date().getFullYear();

const validYear = (y?: number) => y != null && y >= 1850 && y <= currentYear();

/**
 * Saisie de l'âge : l'année de naissance est proposée automatiquement (année en cours − âge)
 * si elle est vide ou si elle avait elle-même été calculée à partir de l'âge précédent.
 * Une année saisie à la main n'est jamais écrasée.
 */
export function agePatch(p: Person, age?: number): Partial<Person> {
  const y = currentYear();
  const auto = !validYear(p.birthYear) || (p.age != null && p.birthYear === y - p.age);
  return auto ? { age, birthYear: age == null ? undefined : y - age } : { age };
}

/** Saisie de l'année de naissance : l'âge est proposé de la même façon (personne vivante). */
export function birthYearPatch(p: Person, birthYear?: number): Partial<Person> {
  const y = currentYear();
  if (p.deceased || !validYear(birthYear)) return { birthYear };
  const auto = p.age == null || !validYear(p.birthYear) || p.age === y - p.birthYear!;
  return auto ? { birthYear, age: y - birthYear! } : { birthYear };
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export function newPerson(sex: Sex, extra: Partial<Person> = {}): Person {
  return { id: uid(), sex, deceased: false, cancers: [], tests: [], ...extra };
}

export function emptyPedigree(): Pedigree {
  const proband = newPerson("F");
  return {
    persons: { [proband.id]: proband },
    couples: [],
    probandId: proband.id,
    consultation: { date: new Date().toISOString().slice(0, 10), indication: "" },
  };
}

const clone = (p: Pedigree): Pedigree => structuredClone(p);

export function partnersOf(p: Pedigree, id: string): string[] {
  return p.couples.filter((c) => c.a === id || c.b === id).map((c) => (c.a === id ? c.b : c.a));
}

export function coupleOf(p: Pedigree, x: string, y: string): Couple | undefined {
  return p.couples.find((c) => (c.a === x && c.b === y) || (c.a === y && c.b === x));
}

export function childrenOf(p: Pedigree, id: string): Person[] {
  return Object.values(p.persons).filter((c) => c.fatherId === id || c.motherId === id);
}

export function childrenOfCouple(p: Pedigree, c: Couple): Person[] {
  return Object.values(p.persons).filter(
    (k) => (k.fatherId === c.a && k.motherId === c.b) || (k.fatherId === c.b && k.motherId === c.a),
  );
}

function link(p: Pedigree, a: string, b: string) {
  if (!coupleOf(p, a, b)) p.couples.push({ id: uid(), a, b });
}

/** Ajoute père + mère (si absents). */
export function addParents(ped: Pedigree, id: string): Pedigree {
  const p = clone(ped);
  const child = p.persons[id];
  if (child.fatherId && child.motherId) return ped;
  const father = child.fatherId ? p.persons[child.fatherId] : newPerson("M");
  const mother = child.motherId ? p.persons[child.motherId] : newPerson("F");
  p.persons[father.id] = father;
  p.persons[mother.id] = mother;
  child.fatherId = father.id;
  child.motherId = mother.id;
  link(p, father.id, mother.id);
  return p;
}

export function addSibling(ped: Pedigree, id: string, sex: Sex): Pedigree {
  let p = ped;
  if (!p.persons[id].fatherId || !p.persons[id].motherId) p = addParents(p, id);
  p = clone(p);
  const ref = p.persons[id];
  const sib = newPerson(sex, { fatherId: ref.fatherId, motherId: ref.motherId });
  p.persons[sib.id] = sib;
  return p;
}

/** Ajoute un demi-frère / demi-sœur via un nouveau conjoint du parent choisi. */
export function addHalfSibling(ped: Pedigree, id: string, sex: Sex, via: "father" | "mother"): Pedigree {
  let p = ped;
  if (!p.persons[id].fatherId || !p.persons[id].motherId) p = addParents(p, id);
  p = clone(p);
  const ref = p.persons[id];
  const parentId = via === "father" ? ref.fatherId! : ref.motherId!;
  const other = newPerson(via === "father" ? "F" : "M");
  p.persons[other.id] = other;
  link(p, parentId, other.id);
  const sib = newPerson(sex, {
    fatherId: via === "father" ? parentId : other.id,
    motherId: via === "father" ? other.id : parentId,
  });
  p.persons[sib.id] = sib;
  return p;
}

export function addPartner(ped: Pedigree, id: string): Pedigree {
  const p = clone(ped);
  const me = p.persons[id];
  const partner = newPerson(me.sex === "M" ? "F" : me.sex === "F" ? "M" : "U");
  p.persons[partner.id] = partner;
  link(p, id, partner.id);
  return p;
}

/** Ajoute un enfant ; crée un conjoint si la personne n'en a pas. */
export function addChild(ped: Pedigree, id: string, sex: Sex, partnerId?: string): Pedigree {
  let p = ped;
  let partner = partnerId ?? partnersOf(p, id)[0];
  if (!partner) {
    p = addPartner(p, id);
    partner = partnersOf(p, id)[0];
  }
  p = clone(p);
  const me = p.persons[id];
  const other = p.persons[partner];
  const [father, mother] =
    me.sex === "F" || other.sex === "M" ? [other.id, me.id] : [me.id, other.id];
  const child = newPerson(sex, { fatherId: father, motherId: mother });
  p.persons[child.id] = child;
  return p;
}

export function canDelete(p: Pedigree, id: string): boolean {
  return id !== p.probandId;
}

/**
 * Supprime une personne. Ses descendants qui ne sont plus reliés
 * au cas index sont supprimés aussi (évite les fragments orphelins).
 */
export function deletePerson(ped: Pedigree, id: string): Pedigree {
  if (!canDelete(ped, id)) return ped;
  const p = clone(ped);
  delete p.persons[id];
  for (const k of Object.values(p.persons)) {
    if (k.fatherId === id) k.fatherId = undefined;
    if (k.motherId === id) k.motherId = undefined;
  }
  p.couples = p.couples.filter((c) => c.a !== id && c.b !== id);
  pruneDisconnected(p);
  return p;
}

function pruneDisconnected(p: Pedigree) {
  const seen = new Set<string>([p.probandId]);
  const stack = [p.probandId];
  while (stack.length) {
    const id = stack.pop()!;
    const me = p.persons[id];
    const neighbours = [
      me.fatherId,
      me.motherId,
      ...partnersOf(p, id),
      ...childrenOf(p, id).map((c) => c.id),
    ].filter((x): x is string => !!x && !!p.persons[x]);
    for (const n of neighbours) if (!seen.has(n)) (seen.add(n), stack.push(n));
  }
  for (const id of Object.keys(p.persons)) if (!seen.has(id)) delete p.persons[id];
  p.couples = p.couples.filter((c) => seen.has(c.a) && seen.has(c.b));
  // Un couple de parents doit rester lié s'il a encore des enfants ; sinon un parent isolé sans enfant est gardé.
  for (const k of Object.values(p.persons)) {
    if (k.fatherId && !p.persons[k.fatherId]) k.fatherId = undefined;
    if (k.motherId && !p.persons[k.motherId]) k.motherId = undefined;
  }
}

export function updatePerson(ped: Pedigree, id: string, patch: Partial<Person>): Pedigree {
  const p = clone(ped);
  p.persons[id] = { ...p.persons[id], ...patch };
  return p;
}

export function setProband(ped: Pedigree, id: string): Pedigree {
  return { ...clone(ped), probandId: id };
}
