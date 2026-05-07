import { useEffect, useMemo, useRef, useState } from 'react';
import { hierarchy, tree as d3tree, type HierarchyPointNode } from 'd3-hierarchy';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import { useTree } from '../../stores/tree';
import type { Person } from '../../types/genealogy';
import { cn, formatLifespan } from '../../lib/utils';

// Renders an aesthetic ancestor pedigree tree with optional descendant
// expansion. Uses d3-hierarchy for layout and d3-zoom for pan/zoom; nodes are
// SVG groups rendered in React for accessibility.

interface TreeNodeData {
  id: string;
  person?: Person;
  placeholder?: boolean;
  children?: TreeNodeData[];
}

type Direction = 'ancestors' | 'descendants';

export function TreeView() {
  const { state, activePersonId, setActive } = useTree();
  const [direction, setDirection] = useState<Direction>('ancestors');
  const [generations, setGenerations] = useState(4);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [transform, setTransform] = useState('translate(0,0) scale(1)');

  const root = useMemo(() => {
    if (!activePersonId) return null;
    return buildHierarchy(state.persons, activePersonId, direction, generations);
  }, [state.persons, activePersonId, direction, generations]);

  const layout = useMemo(() => {
    if (!root) return null;
    const h = hierarchy(root);
    // Compact, generation-aligned layout
    const layout = d3tree<TreeNodeData>()
      .nodeSize([180, 220])
      .separation((a, b) => (a.parent === b.parent ? 1 : 1.4));
    return layout(h);
  }, [root]);

  // Set up d3-zoom once
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const svg = select(svgRef.current);
    const g = select(gRef.current);
    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 2.5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString());
        setTransform(event.transform.toString());
      });
    zoomRef.current = zoomBehavior;
    svg.call(zoomBehavior);
    return () => {
      svg.on('.zoom', null);
    };
  }, []);

  // Center & fit the tree whenever it changes
  useEffect(() => {
    if (!layout || !svgRef.current || !zoomRef.current) return;
    const svg = svgRef.current;
    const { width, height } = svg.getBoundingClientRect();
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    layout.each((d) => {
      // Note: in d3-tree, x is along the depth axis; we render rotated below.
      minX = Math.min(minX, d.x);
      maxX = Math.max(maxX, d.x);
      minY = Math.min(minY, d.y);
      maxY = Math.max(maxY, d.y);
    });
    const w = maxX - minX + 240;
    const h = maxY - minY + 200;
    const scale = Math.min(width / w, height / h, 1);
    const tx = width / 2 - ((minX + maxX) / 2) * scale;
    const ty = height / 2 - ((minY + maxY) / 2) * scale - (direction === 'ancestors' ? -40 : 40);
    select(svg).call(
      zoomRef.current.transform,
      zoomIdentity.translate(tx, ty).scale(scale),
    );
  }, [layout, direction]);

  if (!activePersonId) {
    return (
      <div className="flex h-full items-center justify-center text-center text-ink-300">
        <div>
          <div className="font-serif text-2xl text-parchment-100">No person selected</div>
          <p className="mt-2 max-w-sm text-sm">
            Import a GEDCOM file or import your FamilySearch tree to begin. Then
            click a person to make them the focus of the tree.
          </p>
        </div>
      </div>
    );
  }

  const nodes = layout?.descendants() ?? [];
  const links = layout?.links() ?? [];

  return (
    <div className="relative flex h-full w-full flex-col">
      <div className="flex items-center gap-2 border-b border-ink-700/60 bg-ink-900/40 px-4 py-2">
        <div className="font-serif text-sm text-parchment-200">Pedigree</div>
        <div className="flex items-center gap-1 rounded-lg border border-ink-700 bg-ink-800/60 p-0.5 text-xs">
          <button
            onClick={() => setDirection('ancestors')}
            className={cn(
              'rounded px-2 py-1',
              direction === 'ancestors' && 'bg-parchment-400/20 text-parchment-100',
            )}
          >
            Ancestors
          </button>
          <button
            onClick={() => setDirection('descendants')}
            className={cn(
              'rounded px-2 py-1',
              direction === 'descendants' && 'bg-parchment-400/20 text-parchment-100',
            )}
          >
            Descendants
          </button>
        </div>
        <label className="ml-2 flex items-center gap-2 text-xs text-ink-300">
          Generations
          <input
            type="range"
            min={2}
            max={6}
            value={generations}
            onChange={(e) => setGenerations(parseInt(e.target.value, 10))}
            className="accent-parchment-400"
          />
          <span className="w-4 text-center">{generations}</span>
        </label>
        <div className="ml-auto text-xs text-ink-400 font-mono">{transform}</div>
      </div>
      <svg
        ref={svgRef}
        className="flex-1 cursor-grab active:cursor-grabbing"
        style={{ background: 'radial-gradient(circle at center, rgba(200,160,74,0.06), transparent 70%)' }}
      >
        <defs>
          <linearGradient id="link-grad" x1="0%" x2="0%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(168,162,158,0.5)" />
            <stop offset="100%" stopColor="rgba(168,162,158,0.15)" />
          </linearGradient>
        </defs>
        <g ref={gRef}>
          {links.map((link, i) => (
            <path
              key={i}
              d={curve(link.source, link.target)}
              fill="none"
              stroke="url(#link-grad)"
              strokeWidth={1.5}
            />
          ))}
          {nodes.map((node) => (
            <NodeCard key={node.data.id} node={node} onClick={() => node.data.person && setActive(node.data.person.id)} active={node.data.id === activePersonId} />
          ))}
        </g>
      </svg>
    </div>
  );
}

function curve(s: HierarchyPointNode<TreeNodeData>, t: HierarchyPointNode<TreeNodeData>) {
  const sx = s.x;
  const sy = s.y;
  const tx = t.x;
  const ty = t.y;
  const my = (sy + ty) / 2;
  return `M${sx},${sy} C${sx},${my} ${tx},${my} ${tx},${ty}`;
}

const CARD_W = 160;
const CARD_H = 64;

function NodeCard({
  node,
  onClick,
  active,
}: {
  node: HierarchyPointNode<TreeNodeData>;
  onClick: () => void;
  active: boolean;
}) {
  const p = node.data.person;
  const name = p?.name.full ?? `${p?.name.given ?? ''} ${p?.name.surname ?? ''}`.trim();
  const birth = p?.facts.find((f) => f.type === 'Birth')?.date?.year;
  const death = p?.facts.find((f) => f.type === 'Death')?.date?.year;
  return (
    <g
      transform={`translate(${node.x - CARD_W / 2},${node.y - CARD_H / 2})`}
      onClick={onClick}
      style={{ cursor: p ? 'pointer' : 'default' }}
    >
      <rect
        width={CARD_W}
        height={CARD_H}
        rx={10}
        ry={10}
        fill={node.data.placeholder ? 'rgba(28,25,23,0.6)' : 'rgba(28,25,23,0.85)'}
        stroke={
          active
            ? 'rgba(200,160,74,0.9)'
            : sexStroke(p?.sex)
        }
        strokeWidth={active ? 2 : 1}
      />
      <text
        x={CARD_W / 2}
        y={24}
        textAnchor="middle"
        fontSize={12}
        fontFamily="Cormorant Garamond, serif"
        fontWeight={600}
        fill={node.data.placeholder ? '#a8a29e' : '#f5edd6'}
      >
        {truncate(name || 'Unknown', 22)}
      </text>
      <text
        x={CARD_W / 2}
        y={42}
        textAnchor="middle"
        fontSize={10}
        fill="#a8a29e"
        fontFamily="Inter, sans-serif"
      >
        {formatLifespan(birth, death)}
      </text>
      {p?.fsId && (
        <text
          x={CARD_W / 2}
          y={56}
          textAnchor="middle"
          fontSize={9}
          fill="#78716c"
          fontFamily="ui-monospace, monospace"
        >
          FS:{p.fsId}
        </text>
      )}
    </g>
  );
}

function sexStroke(sex?: string): string {
  if (sex === 'male') return 'rgba(96,165,250,0.45)';
  if (sex === 'female') return 'rgba(244,114,182,0.45)';
  return 'rgba(168,162,158,0.4)';
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// Build a TreeNodeData hierarchy from the flat persons map.
// For 'ancestors' we walk parentIds upward up to N generations;
// for 'descendants' we walk childIds downward.
function buildHierarchy(
  persons: Record<string, Person>,
  rootId: string,
  direction: Direction,
  generations: number,
): TreeNodeData {
  const root = persons[rootId];
  if (!root) return { id: rootId, placeholder: true };

  const visit = (p: Person, depth: number): TreeNodeData => {
    if (depth >= generations) return { id: p.id, person: p };
    const childIds = direction === 'ancestors' ? p.parentIds : p.childIds;
    const children: TreeNodeData[] = [];
    if (childIds.length === 0 && direction === 'ancestors' && depth < generations) {
      // Add placeholder slots so the pedigree shape is preserved
      children.push({ id: `${p.id}_p1`, placeholder: true });
      children.push({ id: `${p.id}_p2`, placeholder: true });
    } else {
      for (const cid of childIds) {
        const c = persons[cid];
        if (c) children.push(visit(c, depth + 1));
      }
    }
    return { id: p.id, person: p, children };
  };
  return visit(root, 0);
}
