import type {
  GxRoot,
  GxPerson,
  GxRelationship,
  GxFact,
  GxName,
} from './familysearch';
import type { Fact, FactType, Name, Person, Sex } from '../types/genealogy';
import { uid } from './utils';

const FACT_TYPE_MAP: Record<string, FactType> = {
  'http://gedcomx.org/Birth': 'Birth',
  'http://gedcomx.org/Death': 'Death',
  'http://gedcomx.org/Marriage': 'Marriage',
  'http://gedcomx.org/Divorce': 'Divorce',
  'http://gedcomx.org/Burial': 'Burial',
  'http://gedcomx.org/Christening': 'Christening',
  'http://gedcomx.org/Residence': 'Residence',
  'http://gedcomx.org/Occupation': 'Occupation',
  'http://gedcomx.org/Immigration': 'Immigration',
  'http://gedcomx.org/Emigration': 'Emigration',
  'http://gedcomx.org/Census': 'Census',
  'http://gedcomx.org/MilitaryService': 'Military',
  'http://gedcomx.org/Education': 'Education',
  'http://gedcomx.org/Religion': 'Religion',
};

function mapSex(g?: { type?: string }): Sex {
  if (!g?.type) return 'unknown';
  if (g.type === 'http://gedcomx.org/Male') return 'male';
  if (g.type === 'http://gedcomx.org/Female') return 'female';
  return 'unknown';
}

function mapName(names?: GxName[]): Name {
  if (!names || names.length === 0) return { full: 'Unknown' };
  const preferred = names.find((n) => n.preferred) ?? names[0];
  const form = preferred?.nameForms?.[0];
  if (!form) return { full: 'Unknown' };
  const parts = form.parts ?? [];
  const given = parts
    .filter((p) => p.type === 'http://gedcomx.org/Given')
    .map((p) => p.value)
    .filter(Boolean)
    .join(' ');
  const surname = parts
    .filter((p) => p.type === 'http://gedcomx.org/Surname')
    .map((p) => p.value)
    .filter(Boolean)
    .join(' ');
  const prefix = parts.find((p) => p.type === 'http://gedcomx.org/Prefix')?.value;
  const suffix = parts.find((p) => p.type === 'http://gedcomx.org/Suffix')?.value;
  return {
    given: given || undefined,
    surname: surname || undefined,
    prefix,
    suffix,
    full: form.fullText ?? [prefix, given, surname, suffix].filter(Boolean).join(' '),
  };
}

function parseYear(value?: string): number | undefined {
  if (!value) return undefined;
  const m = value.match(/(-?\d{3,4})/);
  return m ? parseInt(m[1], 10) : undefined;
}

function mapFact(f: GxFact): Fact {
  const type: FactType = (f.type ? FACT_TYPE_MAP[f.type] : undefined) ?? 'Other';
  return {
    id: f.id ?? uid('fact'),
    type,
    date: f.date
      ? {
          original: f.date.original,
          formal: f.date.formal,
          year: parseYear(f.date.formal ?? f.date.original),
        }
      : undefined,
    place: f.place
      ? {
          original: f.place.original,
          normalized: f.place.normalized?.[0]?.value,
        }
      : undefined,
    value: f.value,
  };
}

export function mapPerson(g: GxPerson): Person {
  return {
    id: g.id,
    fsId: g.id,
    name: mapName(g.names),
    sex: mapSex(g.gender),
    living: g.living,
    facts: (g.facts ?? []).map(mapFact),
    parentIds: [],
    spouseIds: [],
    childIds: [],
  };
}

function relationshipKey(r: GxRelationship): { p1?: string; p2?: string; type?: string } {
  return {
    p1: r.person1?.resourceId ?? extractId(r.person1?.resource),
    p2: r.person2?.resourceId ?? extractId(r.person2?.resource),
    type: r.type,
  };
}

function extractId(resource?: string): string | undefined {
  if (!resource) return undefined;
  const m = resource.match(/persons\/([^/?]+)/);
  return m?.[1];
}

export interface MappedTree {
  persons: Record<string, Person>;
  rootIds: string[];
}

export function mapGedcomxRoot(root: GxRoot, rootHint?: string): MappedTree {
  const persons: Record<string, Person> = {};
  for (const gp of root.persons ?? []) {
    persons[gp.id] = mapPerson(gp);
  }

  for (const r of root.relationships ?? []) {
    const { p1, p2, type } = relationshipKey(r);
    if (!p1 || !p2) continue;
    if (type === 'http://gedcomx.org/Couple') {
      if (persons[p1]) persons[p1].spouseIds.push(p2);
      if (persons[p2]) persons[p2].spouseIds.push(p1);
    } else if (type === 'http://gedcomx.org/ParentChild') {
      // person1 = parent, person2 = child
      if (persons[p1]) persons[p1].childIds.push(p2);
      if (persons[p2]) persons[p2].parentIds.push(p1);
    }
  }

  // dedupe relationship arrays
  for (const p of Object.values(persons)) {
    p.parentIds = [...new Set(p.parentIds)];
    p.spouseIds = [...new Set(p.spouseIds)];
    p.childIds = [...new Set(p.childIds)];
  }

  const rootIds = rootHint && persons[rootHint] ? [rootHint] : Object.keys(persons).slice(0, 1);
  return { persons, rootIds };
}
