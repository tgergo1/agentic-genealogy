import { useMemo, useState } from 'react';
import {
  ChevronRight,
  User,
  Search,
  CalendarDays,
  MapPin,
  ScrollText,
  ExternalLink,
} from 'lucide-react';
import { useTree } from '../../stores/tree';
import { useSettings } from '../../stores/settings';
import { useToasts } from '../ui/Toast';
import { FamilySearchClient } from '../../lib/familysearch';
import { mapGedcomxRoot } from '../../lib/gedcomx-mapper';
import type { Fact, Person } from '../../types/genealogy';
import { cn } from '../../lib/utils';

export function PersonPanel() {
  const { state, activePersonId, setActive, setState } = useTree();
  const { fsConfig, fsTokens } = useSettings();
  const { push } = useToasts();
  const [busy, setBusy] = useState<string | null>(null);

  const person = activePersonId ? state.persons[activePersonId] : undefined;

  const fs = useMemo(
    () => (fsTokens ? new FamilySearchClient(fsConfig, fsTokens) : undefined),
    [fsConfig, fsTokens],
  );

  if (!person) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center text-ink-400">
        <User className="mb-3 h-8 w-8 opacity-40" />
        <p className="text-sm">Select a person on the tree to see their details.</p>
      </div>
    );
  }

  async function pullFromFs() {
    if (!fs || !person?.fsId) return;
    setBusy('fs-pull');
    try {
      const root = await fs.getPersonWithRelationships(person.fsId);
      const mapped = mapGedcomxRoot(root, person.fsId);
      setState((s) => ({
        ...s,
        persons: { ...s.persons, ...mapped.persons },
      }));
      push('success', `Refreshed ${Object.keys(mapped.persons).length} record(s) from FamilySearch.`);
    } catch (err) {
      push('error', (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function pullAncestry() {
    if (!fs || !person?.fsId) return;
    setBusy('fs-ancestry');
    try {
      const root = await fs.getPersonAncestry(person.fsId, 4);
      const mapped = mapGedcomxRoot(root, person.fsId);
      setState((s) => ({
        ...s,
        persons: { ...s.persons, ...mapped.persons },
      }));
      push('success', `Imported ${Object.keys(mapped.persons).length} ancestor record(s).`);
    } catch (err) {
      push('error', (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-ink-700/60 px-5 pb-4 pt-5">
        <div className="text-xs uppercase tracking-wide text-ink-400">Active person</div>
        <h2 className="mt-1 font-serif text-2xl text-parchment-100">
          {(person.name.full ?? `${person.name.given ?? ''} ${person.name.surname ?? ''}`.trim()) || 'Unknown'}
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-300">
          <span className={cn('chip', sexChip(person.sex))}>{person.sex}</span>
          {person.living != null && (
            <span className="chip">{person.living ? 'living' : 'deceased'}</span>
          )}
          {person.fsId && (
            <a
              href={`https://www.familysearch.org/tree/person/details/${person.fsId}`}
              target="_blank"
              rel="noreferrer"
              className="chip hover:border-parchment-400/60"
            >
              FS:{person.fsId} <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        {fs && person.fsId && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={pullFromFs}
              disabled={busy != null}
              className="btn-outline text-xs"
            >
              {busy === 'fs-pull' ? 'Refreshing…' : 'Refresh from FamilySearch'}
            </button>
            <button
              onClick={pullAncestry}
              disabled={busy != null}
              className="btn-outline text-xs"
            >
              {busy === 'fs-ancestry' ? 'Loading…' : 'Pull 4 generations of ancestors'}
            </button>
          </div>
        )}
      </header>
      <div className="flex-1 overflow-auto scrollbar-thin px-5 py-4">
        <SectionTitle icon={<CalendarDays className="h-4 w-4" />} title="Facts" />
        <FactList facts={person.facts} />

        <SectionTitle icon={<User className="h-4 w-4" />} title="Family" />
        <FamilyGroup label="Parents" ids={person.parentIds} onSelect={setActive} />
        <FamilyGroup label="Spouses" ids={person.spouseIds} onSelect={setActive} />
        <FamilyGroup label="Children" ids={person.childIds} onSelect={setActive} />

        {person.notes?.length ? (
          <>
            <SectionTitle icon={<ScrollText className="h-4 w-4" />} title="Notes" />
            <ul className="space-y-2 text-sm text-ink-200">
              {person.notes.map((n, i) => (
                <li key={i} className="surface px-3 py-2 leading-relaxed">
                  {n}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {person.sourceIds?.length ? (
          <>
            <SectionTitle icon={<Search className="h-4 w-4" />} title="Sources" />
            <ul className="space-y-2 text-sm">
              {person.sourceIds.map((sid) => {
                const s = state.sources[sid];
                return (
                  <li key={sid} className="surface px-3 py-2">
                    <div className="font-medium text-parchment-100">
                      {s?.title ?? sid}
                    </div>
                    {s?.citation && (
                      <div className="text-xs text-ink-300">{s.citation}</div>
                    )}
                    {s?.url && (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-parchment-300 hover:underline"
                      >
                        Open source
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}

function sexChip(sex: string) {
  if (sex === 'male') return 'border-blue-700/40 text-blue-200/90';
  if (sex === 'female') return 'border-pink-700/40 text-pink-200/90';
  return '';
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-2 mt-4 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-400">
      {icon}
      {title}
    </div>
  );
}

function FactList({ facts }: { facts: Fact[] }) {
  if (!facts.length) {
    return <div className="text-sm text-ink-400">No facts recorded.</div>;
  }
  const ordered = [...facts].sort((a, b) => (a.date?.year ?? 0) - (b.date?.year ?? 0));
  return (
    <ul className="space-y-1.5">
      {ordered.map((f) => (
        <li
          key={f.id}
          className="flex items-baseline gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-ink-800/40"
        >
          <span className="w-16 shrink-0 font-mono text-xs text-ink-400">
            {f.date?.year ?? f.date?.original?.slice(0, 4) ?? '—'}
          </span>
          <span className="font-medium text-parchment-100">{f.type}</span>
          {f.place?.original && (
            <span className="flex items-center gap-1 text-xs text-ink-300">
              <MapPin className="h-3 w-3" />
              {f.place.original}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function FamilyGroup({
  label,
  ids,
  onSelect,
}: {
  label: string;
  ids: string[];
  onSelect: (id: string) => void;
}) {
  const { state } = useTree();
  if (ids.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="mb-1 text-xs uppercase tracking-wide text-ink-400">{label}</div>
      <div className="space-y-1">
        {ids.map((id) => {
          const p: Person | undefined = state.persons[id];
          const name = p?.name.full ?? `${p?.name.given ?? ''} ${p?.name.surname ?? ''}`.trim();
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className="group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-ink-800/60"
            >
              <span className="text-parchment-100">{name || id}</span>
              <ChevronRight className="h-4 w-4 text-ink-400 transition-transform group-hover:translate-x-0.5" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
