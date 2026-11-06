import { partnersOf } from "./ops";
import type { Pedigree, Sex } from "./types";

export type Side = "paternelle" | "maternelle";

export interface Relation {
  /** Libellé en français, ex. "tante maternelle" */
  label: string;
  /** Degré de parenté avec le cas index (1 = parents, fratrie, enfants) ; absent si par alliance */
  degree?: number;
  side?: Side;
  blood: boolean;
}

const g = (sex: Sex, m: string, f: string, u: string) => (sex === "M" ? m : sex === "F" ? f : u);
const sideAdj = (sex: Sex, side?: Side) =>
  !side ? "" : " " + (side === "paternelle" ? g(sex, "paternel", "paternelle", "paternel(le)") : g(sex, "maternel", "maternelle", "maternel(le)"));

interface Up {
  depth: number;
  side?: Side;
}

/** Ascendants (y compris soi-même à profondeur 0), avec la branche par laquelle on les atteint. */
function ancestors(p: Pedigree, id: string, withSide: boolean): Map<string, Up> {
  const out = new Map<string, Up>([[id, { depth: 0 }]]);
  const queue: string[] = [id];
  while (queue.length) {
    const cur = queue.shift()!;
    const { depth, side } = out.get(cur)!;
    const me = p.persons[cur];
    const parents: [string | undefined, Side][] = [
      [me.fatherId, "paternelle"],
      [me.motherId, "maternelle"],
    ];
    for (const [pid, s] of parents) {
      if (!pid || !p.persons[pid] || out.has(pid)) continue;
      out.set(pid, { depth: depth + 1, side: withSide ? (depth === 0 ? s : side) : undefined });
      queue.push(pid);
    }
  }
  return out;
}

function bloodRelation(p: Pedigree, id: string, probandUp: Map<string, Up>): Relation | null {
  const sex = p.persons[id].sex;
  const mine = ancestors(p, id, false);
  let best: { a: number; b: number } | null = null;
  let commonAtBest = 0;
  let sides = new Set<Side | undefined>();
  for (const [anc, { depth: b }] of mine) {
    const up = probandUp.get(anc);
    if (!up) continue;
    const a = up.depth;
    if (!best || a + b < best.a + best.b) {
      best = { a, b };
      commonAtBest = 1;
      sides = new Set([up.side]);
    } else if (a + b === best.a + best.b && a === best.a) {
      commonAtBest++;
      sides.add(up.side);
    }
  }
  if (!best) return null;
  const { a, b } = best;
  // Une seule branche si tous les ancêtres communs les plus proches sont du même côté (sinon : fratrie, descendance…)
  const side = sides.size === 1 ? [...sides][0] : undefined;
  const half = commonAtBest === 1 && a >= 1 && b >= 1;
  // Degré de parenté génétique : ligne directe = nombre de générations ;
  // collatéraux par les deux parents communs = a + b − 1 (fratrie 1er, oncle/tante 2e, cousin germain 3e) ;
  // demi-collatéraux (un seul ancêtre commun) = a + b (demi-frère 2e…).
  const degree = a === 0 || b === 0 || half ? a + b : a + b - 1;
  const demi = half ? "demi-" : "";
  const S = sideAdj(sex, side);
  let label: string;

  if (a === 0 && b === 0) label = "cas index";
  else if (b === 0) {
    if (a === 1) label = g(sex, "père", "mère", "parent");
    else if (a === 2) label = g(sex, "grand-père", "grand-mère", "grand-parent") + S;
    else if (a === 3) label = g(sex, "arrière-grand-père", "arrière-grand-mère", "arrière-grand-parent") + S;
    else label = `ascendant(e) de ${a}e génération` + S;
  } else if (a === 0) {
    if (b === 1) label = g(sex, "fils", "fille", "enfant");
    else if (b === 2) label = g(sex, "petit-fils", "petite-fille", "petit-enfant");
    else if (b === 3) label = g(sex, "arrière-petit-fils", "arrière-petite-fille", "arrière-petit-enfant");
    else label = `descendant(e) de ${b}e génération`;
  } else if (a === 1 && b === 1) {
    label = demi + g(sex, "frère", "sœur", "membre de la fratrie") + (half ? S : "");
  } else if (b === 1) {
    if (a === 2) label = demi + g(sex, "oncle", "tante", "oncle/tante") + S;
    else if (a === 3) label = demi + g(sex, "grand-oncle", "grand-tante", "grand-oncle/tante") + S;
    else label = `collatéral(e) d'un ascendant de ${a - 1}e génération` + S;
  } else if (a === 1) {
    if (b === 2) label = g(sex, "neveu", "nièce", "neveu/nièce");
    else if (b === 3) label = g(sex, "petit-neveu", "petite-nièce", "petit-neveu/nièce");
    else label = `descendant(e) de la fratrie (${b}e génération)`;
  } else if (a === 2 && b === 2) {
    label = demi + g(sex, "cousin germain", "cousine germaine", "cousin(e) germain(e)") + S;
  } else if (a === 2 && b === 3) {
    label = g(sex, "enfant", "enfant", "enfant") + " d'un(e) cousin(e) germain(e)" + S;
  } else if (a === 3 && b === 2) {
    label = g(sex, "cousin germain", "cousine germaine", "cousin(e) germain(e)") + " d'un parent" + S;
  } else {
    label = "apparenté(e)" + S;
  }
  return { label, degree, side, blood: true };
}

/** Lien de parenté de chaque personne avec le cas index. */
export function computeRelations(p: Pedigree): Record<string, Relation> {
  const probandUp = ancestors(p, p.probandId, true);
  const out: Record<string, Relation> = {};
  for (const id of Object.keys(p.persons)) {
    const r = bloodRelation(p, id, probandUp);
    if (r) out[id] = r;
  }
  for (const id of Object.keys(p.persons)) {
    if (out[id]) continue;
    const sex = p.persons[id].sex;
    const conj = g(sex, "conjoint", "conjointe", "conjoint(e)");
    const bloodPartner = partnersOf(p, id).find((x) => out[x]);
    if (bloodPartner === p.probandId) out[id] = { label: conj, blood: false };
    else if (bloodPartner) {
      const r = out[bloodPartner];
      const ps = p.persons[bloodPartner].sex;
      const art = /^[aeéèêiouh]/i.test(r.label) ? "de l'" : ps === "F" ? "de la " : ps === "M" ? "du " : "de ";
      out[id] = { label: `${conj} ${art}${r.label}`, blood: false, side: r.side };
    } else out[id] = { label: "apparenté(e) par alliance", blood: false };
  }
  return out;
}

export function degreeLabel(d?: number): string {
  if (!d) return "";
  return d === 1 ? "1er degré" : `${d}e degré`;
}
