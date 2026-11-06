import { LINE_H, NODE, type LaidOut } from "../layout";
import { labelLines } from "../treeLabels";
import { cancerColor } from "../model/cancers";
import { childrenOfCouple } from "../model/ops";
import type { Pedigree, Person } from "../model/types";

interface Props {
  pedigree: Pedigree;
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
  zoom: number;
  laid: LaidOut;
  /** Afficher sur l'arbre les précisions des cancers et les notes */
  showDetails: boolean;
}

const R = NODE / 2;

function Shape({ person, fill, clipId }: { person: Person; fill?: string; clipId?: string }) {
  const common = { fill: fill ?? "var(--node-bg)", stroke: "var(--ink)", strokeWidth: 2, clipPath: clipId ? `url(#${clipId})` : undefined };
  if (person.sex === "M") return <rect x={-R} y={-R} width={NODE} height={NODE} {...common} />;
  if (person.sex === "F") return <circle r={R} {...common} />;
  return <polygon points={`0,${-R - 3} ${R + 3},0 0,${R + 3} ${-R - 3},0`} {...common} />;
}

function ClipShape({ person, id }: { person: Person; id: string }) {
  return (
    <clipPath id={id}>
      {person.sex === "M" ? (
        <rect x={-R} y={-R} width={NODE} height={NODE} />
      ) : person.sex === "F" ? (
        <circle r={R} />
      ) : (
        <polygon points={`0,${-R - 3} ${R + 3},0 0,${R + 3} ${-R - 3},0`} />
      )}
    </clipPath>
  );
}

/** Remplissage en secteurs : un secteur coloré par cancer. */
function Sectors({ person, clipId }: { person: Person; clipId: string }) {
  const n = person.cancers.length;
  if (!n) return null;
  if (n === 1) return <g clipPath={`url(#${clipId})`}><rect x={-R - 4} y={-R - 4} width={NODE + 8} height={NODE + 8} fill={cancerColor(person.cancers[0].site)} /></g>;
  const big = R * 2;
  return (
    <g clipPath={`url(#${clipId})`}>
      {person.cancers.map((c, i) => {
        const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const a1 = -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / n;
        const d = `M0,0 L${big * Math.cos(a0)},${big * Math.sin(a0)} A${big},${big} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${big * Math.cos(a1)},${big * Math.sin(a1)} Z`;
        return <path key={c.id} d={d} fill={cancerColor(c.site)} />;
      })}
    </g>
  );
}

export function PedigreeView({ pedigree, selectedId, onSelect, zoom, laid, showDetails }: Props) {
  const { pos, width, height } = laid;
  const persons = Object.values(pedigree.persons).filter((p) => pos[p.id]);

  const edges: React.ReactNode[] = [];
  const coupled = new Set<string>();
  for (const c of pedigree.couples) {
    const a = pos[c.a];
    const b = pos[c.b];
    if (!a || !b) continue;
    const [l, r] = a.x <= b.x ? [a, b] : [b, a];
    edges.push(<line key={`c-${c.id}`} x1={l.x + R} y1={l.y} x2={r.x - R} y2={r.y} className="edge" />);
    if (c.consanguineous)
      edges.push(<line key={`cc-${c.id}`} x1={l.x + R} y1={l.y + 5} x2={r.x - R} y2={r.y + 5} className="edge" />);
    if (c.separated) {
      const mx = (l.x + r.x) / 2;
      edges.push(<path key={`s-${c.id}`} d={`M${mx - 6},${l.y + 8} L${mx},${l.y - 8} M${mx},${l.y + 8} L${mx + 6},${l.y - 8}`} className="edge" />);
    }
    const kids = childrenOfCouple(pedigree, c).filter((k) => pos[k.id]);
    if (!kids.length) continue;
    kids.forEach((k) => coupled.add(k.id));
    const mx = (l.x + r.x) / 2;
    const kidY = pos[kids[0].id].y;
    const busY = kidY - R - 30;
    const xs = kids.map((k) => pos[k.id].x);
    edges.push(<line key={`d-${c.id}`} x1={mx} y1={l.y} x2={mx} y2={busY} className="edge" />);
    edges.push(<line key={`h-${c.id}`} x1={Math.min(mx, ...xs)} y1={busY} x2={Math.max(mx, ...xs)} y2={busY} className="edge" />);
    kids.forEach((k) =>
      edges.push(<line key={`k-${k.id}`} x1={pos[k.id].x} y1={busY} x2={pos[k.id].x} y2={pos[k.id].y - R - (k.sex === "U" ? 3 : 0)} className="edge" />),
    );
  }
  // Enfants dont un seul parent est connu
  for (const k of persons) {
    if (coupled.has(k.id)) continue;
    const pid = k.fatherId ?? k.motherId;
    if (!pid || !pos[pid]) continue;
    edges.push(<line key={`sp-${k.id}`} x1={pos[pid].x} y1={pos[pid].y + R} x2={pos[k.id].x} y2={pos[k.id].y - R} className="edge" />);
  }

  return (
    <svg
      className="pedigree"
      width={width * zoom}
      height={height * zoom}
      viewBox={`0 0 ${width} ${height}`}
      onClick={() => onSelect(undefined)}
      role="img"
      aria-label="Arbre généalogique"
    >
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--ink)" />
        </marker>
      </defs>
      <g>{edges}</g>
      {persons.map((person) => {
        const { x, y } = pos[person.id];
        const clipId = `clip-${person.id}`;
        const selected = person.id === selectedId;
        const isProband = person.id === pedigree.probandId;
        return (
          <g
            key={person.id}
            transform={`translate(${x},${y})`}
            className={`node${selected ? " selected" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(person.id);
            }}
          >
            <defs>
              <ClipShape person={person} id={clipId} />
            </defs>
            {selected && <circle r={R + 12} className="halo" />}
            <Shape person={person} />
            <Sectors person={person} clipId={clipId} />
            <Shape person={person} fill="none" />
            {person.deceased && <line x1={-R - 6} y1={R + 6} x2={R + 6} y2={-R - 6} stroke="var(--ink)" strokeWidth={2} />}
            {person.tests.some((t) => t.result === "pathogène" || t.result === "probablement pathogène") && (
              <circle r={5} fill="var(--ink)" stroke="white" strokeWidth={1.5} />
            )}
            {person.adopted && (
              <path d={`M${-R - 6},${-R - 4} L${-R - 10},${-R - 4} L${-R - 10},${R + 4} L${-R - 6},${R + 4} M${R + 6},${-R - 4} L${R + 10},${-R - 4} L${R + 10},${R + 4} L${R + 6},${R + 4}`} fill="none" stroke="var(--ink)" strokeWidth={1.5} />
            )}
            {isProband && (
              <>
                <line x1={-R - 30} y1={R + 10} x2={-R + 2} y2={R - 6} stroke="var(--ink)" strokeWidth={2} markerEnd="url(#arrow)" />
                <text x={-R - 42} y={R + 18} className="proband-p">P</text>
              </>
            )}
            {person.unknownHistory && <text x={R + 6} y={-R + 4} className="unknown">?</text>}
            <text y={R + 18} className="node-label">
              {labelLines(person, showDetails).map((l, i) => (
                <tspan
                  key={i}
                  x={0}
                  dy={i === 0 ? 0 : LINE_H}
                  fill={l.color}
                  fontWeight={l.bold ? 600 : 400}
                  fontSize={l.small ? 10.5 : undefined}
                  fontStyle={l.small ? "italic" : undefined}
                >
                  {l.text}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
