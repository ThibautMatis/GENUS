import { childrenOf, partnersOf } from "./model/ops";
import { computeRelations } from "./model/relations";
import type { Pedigree, Person } from "./model/types";

export const NODE = 40;
export const UNIT = 120;
export const GEN_H = 190;
/** Interligne des textes sous les symboles */
export const LINE_H = 14;
const GAP = 40;

export interface LaidOut {
  pos: Record<string, { x: number; y: number }>;
  width: number;
  height: number;
}

interface Block {
  /** personnes de gauche à droite (ordre interne recalculé à chaque passe) */
  members: string[];
  kind: "sibship" | "founders";
  /** pour une fratrie : ids des parents */
  parents?: [string | undefined, string | undefined];
  center: number;
}

/** Génération de chaque personne : BFS depuis le cas index. */
function generations(p: Pedigree): Record<string, number> {
  const gen: Record<string, number> = { [p.probandId]: 0 };
  const queue = [p.probandId];
  while (queue.length) {
    const id = queue.shift()!;
    const me = p.persons[id];
    const g = gen[id];
    const next: [string | undefined, number][] = [
      [me.fatherId, g - 1],
      [me.motherId, g - 1],
      ...partnersOf(p, id).map((x): [string, number] => [x, g]),
      ...childrenOf(p, id).map((c): [string, number] => [c.id, g + 1]),
    ];
    for (const [n, ng] of next) {
      if (!n || !p.persons[n] || n in gen) continue;
      gen[n] = ng;
      queue.push(n);
    }
  }
  const min = Math.min(...Object.values(gen));
  for (const k in gen) gen[k] -= min;
  return gen;
}

const hasParents = (x: Person) => !!(x.fatherId || x.motherId);

function birthKey(x: Person): number {
  if (x.birthYear) return x.birthYear;
  const thisYear = new Date().getFullYear();
  if (x.age != null) return thisYear - x.age;
  return Number.POSITIVE_INFINITY; // inconnu : à la fin
}

/** Isotonic regression (PAVA) : positions les plus proches des cibles en respectant l'ordre et les écarts. */
function pack(targets: number[], seps: number[]): number[] {
  const n = targets.length;
  const offset: number[] = [0];
  for (let i = 1; i < n; i++) offset[i] = offset[i - 1] + seps[i - 1];
  const y = targets.map((t, i) => t - offset[i]);
  const blocks: { sum: number; count: number }[] = [];
  for (const v of y) {
    blocks.push({ sum: v, count: 1 });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1];
      const a = blocks[blocks.length - 2];
      if (a.sum / a.count <= b.sum / b.count) break;
      blocks.splice(blocks.length - 2, 2, { sum: a.sum + b.sum, count: a.count + b.count });
    }
  }
  const out: number[] = [];
  for (const b of blocks) for (let k = 0; k < b.count; k++) out.push(b.sum / b.count);
  return out.map((v, i) => v + offset[i]);
}

/**
 * @param lineCount nombre de lignes de texte sous chaque personne : l'espace entre
 * générations s'agrandit si besoin pour que les textes ne chevauchent pas les traits.
 */
export function layout(p: Pedigree, lineCount: (person: Person) => number = () => 3): LaidOut {
  const gen = generations(p);
  const rels = computeRelations(p);
  const persons = Object.values(p.persons).filter((x) => x.id in gen);
  const sideSeed = (id: string) => (rels[id]?.side === "paternelle" ? -1 : rels[id]?.side === "maternelle" ? 1 : 0);

  // --- Construction des blocs ---
  const marriedIn: Record<string, string[]> = {}; // conjoint apparenté -> conjoints "entrants"
  const inBlock = new Set<string>();
  const blocksByGen: Record<number, Block[]> = {};
  const push = (g: number, b: Block) => (blocksByGen[g] ??= []).push(b);

  const anchorOf: Record<string, string> = {};
  for (const x of persons) {
    if (hasParents(x)) continue;
    const anchor = partnersOf(p, x.id).find((q) => p.persons[q] && hasParents(p.persons[q]) && gen[q] === gen[x.id]);
    if (anchor) {
      (marriedIn[anchor] ??= []).push(x.id);
      anchorOf[x.id] = anchor;
      inBlock.add(x.id);
    }
  }
  // Conjoints en chaîne (ex. second conjoint de la mère) : placés juste après leur conjoint "entrant"
  for (let changed = true; changed; ) {
    changed = false;
    for (const x of persons) {
      if (hasParents(x) || inBlock.has(x.id)) continue;
      const via = partnersOf(p, x.id).find((q) => anchorOf[q] && gen[q] === gen[x.id]);
      if (!via) continue;
      const list = marriedIn[anchorOf[via]];
      list.splice(list.indexOf(via) + 1, 0, x.id);
      anchorOf[x.id] = anchorOf[via];
      inBlock.add(x.id);
      changed = true;
    }
  }
  const sibships = new Map<string, string[]>();
  for (const x of persons) {
    if (!hasParents(x)) continue;
    const key = `${x.fatherId ?? ""}|${x.motherId ?? ""}`;
    if (!sibships.has(key)) sibships.set(key, []);
    sibships.get(key)!.push(x.id);
    inBlock.add(x.id);
  }
  for (const [key, ids] of sibships) {
    const [f, m] = key.split("|");
    ids.sort((a, b) => birthKey(p.persons[a]) - birthKey(p.persons[b]));
    push(gen[ids[0]], { members: ids, kind: "sibship", parents: [f || undefined, m || undefined], center: 0 });
  }
  // Fondateurs : composantes de personnes sans parents reliées par des unions
  for (const x of persons) {
    if (inBlock.has(x.id)) continue;
    const group: string[] = [];
    const stack = [x.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (inBlock.has(id)) continue;
      inBlock.add(id);
      group.push(id);
      for (const q of partnersOf(p, id)) if (!inBlock.has(q) && gen[q] === gen[id]) stack.push(q);
    }
    group.sort((a, b) => (p.persons[a].sex === "M" ? -1 : 0) - (p.persons[b].sex === "M" ? -1 : 0));
    push(gen[x.id], { members: group, kind: "founders", center: 0 });
  }

  const x: Record<string, number> = {};
  const gens = Object.keys(blocksByGen).map(Number).sort((a, b) => a - b);

  /** Liste de gauche à droite des personnes du bloc, conjoints entrants compris. */
  const expand = (b: Block): string[] => {
    if (b.kind === "founders") return b.members;
    // Orientation : un membre marié à quelqu'un d'une autre fratrie va du côté de celle-ci.
    const own = b.parents ? mid(b.parents) : 0;
    const left: string[] = [];
    const middle: string[] = [];
    const right: string[] = [];
    for (const id of b.members) {
      const inTree = partnersOf(p, id).find((q) => p.persons[q] && hasParents(p.persons[q]));
      if (inTree) {
        const q = p.persons[inTree];
        const theirs = mid([q.fatherId, q.motherId]);
        (theirs < own ? left : right).push(id);
      } else middle.push(id);
    }
    const seq = [...left, ...middle, ...right];
    const out: string[] = [];
    for (const id of seq) {
      const spouses = marriedIn[id] ?? [];
      if (right.includes(id)) out.push(...spouses, id);
      else out.push(id, ...spouses);
    }
    return out;
  };

  const mid = (ids: (string | undefined)[]): number => {
    const xs = ids.filter((i): i is string => !!i && i in x).map((i) => x[i]);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  };

  const childrenCenter = (b: Block): number | undefined => {
    const kids = new Set<string>();
    for (const m of b.members) for (const c of childrenOf(p, m)) if (c.id in x) kids.add(c.id);
    if (!kids.size) return undefined;
    return mid([...kids]);
  };

  const place = (g: number, targetOf: (b: Block) => number, reorder: boolean) => {
    const blocks = blocksByGen[g];
    let lists = blocks.map(expand);
    // La cible vise le centre des membres "propres" du bloc (la fratrie), pas des conjoints ajoutés
    blocks.forEach((b, i) => {
      const idx = b.members.map((m) => lists[i].indexOf(m));
      const coreMid = idx.reduce((s, k) => s + k, 0) / idx.length;
      b.center = targetOf(b) - (coreMid - (lists[i].length - 1) / 2) * UNIT;
    });
    if (reorder) {
      blocks.sort((a, b) => a.center - b.center);
      lists = blocks.map(expand);
    }
    const widths = lists.map((l) => l.length * UNIT);
    const seps = widths.slice(1).map((w, i) => (widths[i] + w) / 2 + GAP);
    const centers = pack(
      blocks.map((b) => b.center),
      seps,
    );
    blocks.forEach((b, i) => {
      b.center = centers[i];
      const list = lists[i];
      list.forEach((id, k) => (x[id] = centers[i] + (k - (list.length - 1) / 2) * UNIT));
    });
  };

  // Passe 1 : descendante, avec tri des blocs
  for (const g of gens) {
    place(
      g,
      (b) =>
        b.kind === "sibship"
          ? mid(b.parents!)
          : (b.members.reduce((s, m) => s + sideSeed(m), 0) / b.members.length) * 1,
      true,
    );
  }
  // Passes d'ajustement : remontée (fondateurs centrés sur leurs enfants) puis redescente
  for (let it = 0; it < 4; it++) {
    for (const g of [...gens].reverse()) {
      place(g, (b) => (b.kind === "founders" ? (childrenCenter(b) ?? b.center) : b.center), false);
    }
    for (const g of gens) {
      place(g, (b) => (b.kind === "sibship" ? mid(b.parents!) : b.center), false);
    }
  }

  const xs = Object.values(x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const margin = UNIT;
  const pos: LaidOut["pos"] = {};
  // Hauteur de chaque génération selon le texte le plus long qu'elle contient
  const maxGen = gens.length ? Math.max(...gens) : 0;
  const rowH: number[] = [];
  for (let g = 0; g <= maxGen; g++) {
    const lines = Math.max(0, ...persons.filter((q) => gen[q.id] === g).map((q) => lineCount(q)));
    rowH[g] = Math.max(GEN_H, 2 * NODE + 72 + (lines - 1) * LINE_H);
  }
  const rowY: number[] = [90];
  for (let g = 1; g <= maxGen + 1; g++) rowY[g] = rowY[g - 1] + rowH[g - 1];
  for (const id in x) pos[id] = { x: x[id] - minX + margin, y: rowY[gen[id]] };
  return {
    pos,
    width: maxX - minX + 2 * margin,
    height: rowY[maxGen + 1] - 30,
  };
}
