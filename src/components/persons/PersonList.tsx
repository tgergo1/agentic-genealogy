import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useTree } from '../../stores/tree';
import { cn, formatLifespan } from '../../lib/utils';

export function PersonList() {
  const { state, activePersonId, setActive } = useTree();
  const [query, setQuery] = useState('');

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const arr = Object.values(state.persons);
    const filtered = q
      ? arr.filter(
          (p) =>
            (p.name.full ?? '').toLowerCase().includes(q) ||
            (p.name.surname ?? '').toLowerCase().includes(q) ||
            (p.name.given ?? '').toLowerCase().includes(q),
        )
      : arr;
    return filtered.sort(
      (a, b) =>
        (a.name.surname ?? '').localeCompare(b.name.surname ?? '') ||
        (a.name.given ?? '').localeCompare(b.name.given ?? ''),
    );
  }, [state.persons, query]);

  return (
    <div className="flex h-full flex-col">
      <div className="relative border-b border-ink-700/60 p-2">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search persons…"
          className="input pl-9"
        />
      </div>
      <div className="flex-1 overflow-auto scrollbar-thin py-1">
        {list.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-ink-400">
            No persons yet. Import a GEDCOM or pull from FamilySearch.
          </div>
        )}
        <ul>
          {list.map((p) => {
            const birth = p.facts.find((f) => f.type === 'Birth')?.date?.year;
            const death = p.facts.find((f) => f.type === 'Death')?.date?.year;
            const active = p.id === activePersonId;
            return (
              <li key={p.id}>
                <button
                  onClick={() => setActive(p.id)}
                  className={cn(
                    'flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors',
                    active
                      ? 'bg-parchment-400/15 text-parchment-100'
                      : 'hover:bg-ink-800/60',
                  )}
                >
                  <div>
                    <div className="font-medium">
                      {(p.name.full ?? `${p.name.given ?? ''} ${p.name.surname ?? ''}`.trim()) || 'Unknown'}
                    </div>
                    <div className="font-mono text-[11px] text-ink-400">
                      {formatLifespan(birth, death)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 text-[10px] text-ink-400">
                    {p.fsId && <span>FS</span>}
                    {p.notes?.length ? <span>{p.notes.length}n</span> : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
