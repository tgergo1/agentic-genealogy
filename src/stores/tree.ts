import { create } from 'zustand';
import { readKey, writeKey, StorageKeys } from '../lib/storage';
import type { GenealogyState, Person, Source } from '../types/genealogy';
import { uid } from '../lib/utils';

const EMPTY: GenealogyState = { persons: {}, sources: {}, families: {} };

interface TreeStore {
  state: GenealogyState;
  activePersonId?: string;
  loaded: boolean;
  load: () => Promise<void>;
  setState: (mutate: (s: GenealogyState) => GenealogyState) => void;
  setActive: (id?: string) => void;
  upsertPerson: (p: Partial<Person> & Pick<Person, 'name'>) => string;
  upsertSource: (s: Partial<Source> & Pick<Source, 'title'>) => string;
  reset: () => Promise<void>;
}

export const useTree = create<TreeStore>((set, get) => ({
  state: EMPTY,
  loaded: false,
  async load() {
    const stored = await readKey<GenealogyState>(StorageKeys.Tree);
    set({ state: stored ?? EMPTY, loaded: true });
    if (stored?.rootPersonId) set({ activePersonId: stored.rootPersonId });
  },
  setState(mutate) {
    const next = mutate(get().state);
    set({ state: next });
    void writeKey(StorageKeys.Tree, next);
  },
  setActive(id) {
    set({ activePersonId: id });
  },
  upsertPerson(p) {
    const id = p.id ?? uid('p');
    const existing = get().state.persons[id];
    const merged: Person = {
      id,
      name: p.name,
      sex: p.sex ?? existing?.sex ?? 'unknown',
      facts: p.facts ?? existing?.facts ?? [],
      parentIds: p.parentIds ?? existing?.parentIds ?? [],
      spouseIds: p.spouseIds ?? existing?.spouseIds ?? [],
      childIds: p.childIds ?? existing?.childIds ?? [],
      living: p.living ?? existing?.living,
      notes: p.notes ?? existing?.notes,
      sourceIds: p.sourceIds ?? existing?.sourceIds,
      fsId: p.fsId ?? existing?.fsId,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    get().setState((s) => ({ ...s, persons: { ...s.persons, [id]: merged } }));
    return id;
  },
  upsertSource(s) {
    const id = s.id ?? uid('s');
    const existing = get().state.sources[id];
    const merged: Source = {
      id,
      title: s.title,
      citation: s.citation ?? existing?.citation,
      url: s.url ?? existing?.url,
      description: s.description ?? existing?.description,
      repository: s.repository ?? existing?.repository,
      attachedToPersonIds: s.attachedToPersonIds ?? existing?.attachedToPersonIds,
      fsId: s.fsId ?? existing?.fsId,
    };
    get().setState((st) => ({ ...st, sources: { ...st.sources, [id]: merged } }));
    return id;
  },
  async reset() {
    set({ state: EMPTY, activePersonId: undefined });
    await writeKey(StorageKeys.Tree, EMPTY);
  },
}));
