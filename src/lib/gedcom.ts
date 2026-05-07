// GEDCOM 5.5.1 import / export.
//
// We support a pragmatic subset that round-trips the data we care about:
// names, sex, birth/death/marriage facts, parent/child links, sources, notes.
// Anything we can't represent on import is preserved as a best-effort note.

import type {
  DateValue,
  Fact,
  FactType,
  GenealogyState,
  Name,
  Person,
  Sex,
  Source,
} from '../types/genealogy';
import { uid } from './utils';

interface RawLine {
  level: number;
  xref?: string;
  tag: string;
  value?: string;
  children: RawLine[];
}

function tokenize(text: string): RawLine[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const root: RawLine = { level: -1, tag: '', children: [] };
  const stack: RawLine[] = [root];
  for (const raw of lines) {
    if (!raw.trim()) continue;
    // Format: LEVEL [@xref@] TAG [VALUE]
    const m = raw.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s(.*))?$/);
    if (!m) continue;
    const level = parseInt(m[1], 10);
    const node: RawLine = {
      level,
      xref: m[2],
      tag: m[3].toUpperCase(),
      value: m[4],
      children: [],
    };
    while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return root.children;
}

function findChild(line: RawLine, tag: string): RawLine | undefined {
  return line.children.find((c) => c.tag === tag);
}

function findChildren(line: RawLine, tag: string): RawLine[] {
  return line.children.filter((c) => c.tag === tag);
}

function concatText(line: RawLine): string {
  let s = line.value ?? '';
  for (const c of line.children) {
    if (c.tag === 'CONT') s += '\n' + (c.value ?? '');
    else if (c.tag === 'CONC') s += c.value ?? '';
  }
  return s;
}

const FACT_TAG_TO_TYPE: Record<string, FactType> = {
  BIRT: 'Birth',
  DEAT: 'Death',
  MARR: 'Marriage',
  DIV: 'Divorce',
  BURI: 'Burial',
  CHR: 'Christening',
  RESI: 'Residence',
  OCCU: 'Occupation',
  IMMI: 'Immigration',
  EMIG: 'Emigration',
  CENS: 'Census',
  EDUC: 'Education',
  RELI: 'Religion',
};
const TYPE_TO_FACT_TAG: Record<FactType, string> = {
  Birth: 'BIRT',
  Death: 'DEAT',
  Marriage: 'MARR',
  Divorce: 'DIV',
  Burial: 'BURI',
  Christening: 'CHR',
  Residence: 'RESI',
  Occupation: 'OCCU',
  Immigration: 'IMMI',
  Emigration: 'EMIG',
  Census: 'CENS',
  Military: 'EVEN',
  Education: 'EDUC',
  Religion: 'RELI',
  Other: 'EVEN',
};

function parseDate(line?: RawLine): DateValue | undefined {
  if (!line || !line.value) return undefined;
  const original = line.value;
  // Extract a year if present
  const yearMatch = original.match(/(-?\d{3,4})\s*$/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
  return { original, year };
}

function parseFact(line: RawLine, type: FactType): Fact {
  const date = parseDate(findChild(line, 'DATE'));
  const placeLine = findChild(line, 'PLAC');
  return {
    id: uid('fact'),
    type,
    date,
    place: placeLine?.value ? { original: placeLine.value } : undefined,
    value: line.value || findChild(line, 'NOTE')?.value,
  };
}

function parseName(line: RawLine): Name {
  const v = line.value ?? '';
  // GEDCOM name format: Given /Surname/ Suffix
  const m = v.match(/^(.*?)\s*\/(.*?)\/\s*(.*)$/);
  const given = m ? m[1].trim() : v;
  const surname = m ? m[2].trim() : '';
  const suffix = m && m[3] ? m[3].trim() : undefined;
  return {
    given: given || undefined,
    surname: surname || undefined,
    suffix: suffix || undefined,
    full: [given, surname, suffix].filter(Boolean).join(' '),
  };
}

function parseSex(line?: RawLine): Sex {
  if (!line?.value) return 'unknown';
  if (line.value.toUpperCase().startsWith('M')) return 'male';
  if (line.value.toUpperCase().startsWith('F')) return 'female';
  return 'unknown';
}

export function importGedcom(text: string): GenealogyState {
  const tokens = tokenize(text);
  const persons: Record<string, Person> = {};
  const sources: Record<string, Source> = {};
  // first pass: persons + sources
  const indis = tokens.filter((t) => t.tag === 'INDI');
  const fams = tokens.filter((t) => t.tag === 'FAM');
  const sourceLines = tokens.filter((t) => t.tag === 'SOUR');

  for (const s of sourceLines) {
    if (!s.xref) continue;
    const id = s.xref;
    sources[id] = {
      id,
      title:
        findChild(s, 'TITL')?.value ??
        findChild(s, 'AUTH')?.value ??
        'Untitled source',
      citation: findChild(s, 'PAGE')?.value,
      url: findChild(s, 'URL')?.value,
      description: findChild(s, 'NOTE') ? concatText(findChild(s, 'NOTE')!) : undefined,
      repository: findChild(s, 'REPO')?.value,
    };
  }

  for (const indi of indis) {
    if (!indi.xref) continue;
    const id = indi.xref;
    const nameLine = findChild(indi, 'NAME');
    const sex = parseSex(findChild(indi, 'SEX'));
    const facts: Fact[] = [];
    for (const child of indi.children) {
      const ft = FACT_TAG_TO_TYPE[child.tag];
      if (ft) facts.push(parseFact(child, ft));
      if (child.tag === 'EVEN') {
        const t = findChild(child, 'TYPE')?.value ?? 'Other';
        facts.push(parseFact(child, (FACT_TAG_TO_TYPE[t.toUpperCase()] ?? 'Other')));
      }
    }
    const sourceIds = findChildren(indi, 'SOUR')
      .map((s) => s.value)
      .filter((v): v is string => Boolean(v));
    const notes = findChildren(indi, 'NOTE').map(concatText).filter(Boolean);
    persons[id] = {
      id,
      name: nameLine ? parseName(nameLine) : { full: 'Unknown' },
      sex,
      facts,
      parentIds: [],
      spouseIds: [],
      childIds: [],
      sourceIds: sourceIds.length ? sourceIds : undefined,
      notes: notes.length ? notes : undefined,
    };
  }

  for (const fam of fams) {
    const husb = findChild(fam, 'HUSB')?.value;
    const wife = findChild(fam, 'WIFE')?.value;
    const childRefs = findChildren(fam, 'CHIL').map((c) => c.value).filter(Boolean) as string[];
    const marriage = findChild(fam, 'MARR');
    if (husb && wife && persons[husb] && persons[wife]) {
      persons[husb].spouseIds.push(wife);
      persons[wife].spouseIds.push(husb);
      if (marriage) {
        const f = parseFact(marriage, 'Marriage');
        persons[husb].facts.push(f);
        persons[wife].facts.push({ ...f, id: uid('fact') });
      }
    }
    for (const c of childRefs) {
      if (!persons[c]) continue;
      if (husb && persons[husb]) {
        persons[husb].childIds.push(c);
        persons[c].parentIds.push(husb);
      }
      if (wife && persons[wife]) {
        persons[wife].childIds.push(c);
        persons[c].parentIds.push(wife);
      }
    }
  }

  for (const p of Object.values(persons)) {
    p.parentIds = [...new Set(p.parentIds)];
    p.spouseIds = [...new Set(p.spouseIds)];
    p.childIds = [...new Set(p.childIds)];
  }

  return { persons, sources, families: {}, rootPersonId: Object.keys(persons)[0] };
}

// ---------- Export ----------

function w(level: number, tag: string, value?: string, xref?: string): string {
  const head = `${level}${xref ? ` ${xref}` : ''} ${tag}`;
  if (!value) return head;
  return `${head} ${value}`;
}

function writeFact(level: number, f: Fact): string[] {
  const tag = TYPE_TO_FACT_TAG[f.type];
  const out: string[] = [w(level, tag)];
  if (f.type === 'Other' || tag === 'EVEN') {
    out.push(w(level + 1, 'TYPE', f.type));
  }
  if (f.date?.original) out.push(w(level + 1, 'DATE', f.date.original));
  if (f.place?.original) out.push(w(level + 1, 'PLAC', f.place.original));
  if (f.value) out.push(w(level + 1, 'NOTE', f.value));
  return out;
}

function writeName(level: number, n: Name): string {
  const given = n.given ?? '';
  const surname = n.surname ?? '';
  const value = `${given}${surname ? ` /${surname}/` : ''}${n.suffix ? ` ${n.suffix}` : ''}`.trim();
  return w(level, 'NAME', value);
}

export function exportGedcom(state: GenealogyState): string {
  const lines: string[] = [];
  lines.push(w(0, 'HEAD'));
  lines.push(w(1, 'SOUR', 'agentic-genealogy'));
  lines.push(w(2, 'NAME', 'Agentic Genealogy'));
  lines.push(w(2, 'VERS', '0.1.0'));
  lines.push(w(1, 'GEDC'));
  lines.push(w(2, 'VERS', '5.5.1'));
  lines.push(w(2, 'FORM', 'LINEAGE-LINKED'));
  lines.push(w(1, 'CHAR', 'UTF-8'));

  // Persons
  for (const p of Object.values(state.persons)) {
    const xref = p.id.startsWith('@') ? p.id : `@${p.id}@`;
    lines.push(w(0, 'INDI', undefined, xref));
    lines.push(writeName(1, p.name));
    if (p.sex !== 'unknown') {
      lines.push(w(1, 'SEX', p.sex === 'male' ? 'M' : 'F'));
    }
    for (const f of p.facts) lines.push(...writeFact(1, f));
    for (const note of p.notes ?? []) lines.push(w(1, 'NOTE', note.replace(/\n/g, ' ')));
    for (const sid of p.sourceIds ?? []) {
      const s = sid.startsWith('@') ? sid : `@${sid}@`;
      lines.push(w(1, 'SOUR', s));
    }
  }

  // Families derived from couple + parent-child relationships
  const fams = deriveFamilies(state.persons);
  fams.forEach((f, idx) => {
    const fid = `@F${idx + 1}@`;
    lines.push(w(0, 'FAM', undefined, fid));
    if (f.husbandId) lines.push(w(1, 'HUSB', `@${f.husbandId}@`));
    if (f.wifeId) lines.push(w(1, 'WIFE', `@${f.wifeId}@`));
    for (const c of f.childIds) lines.push(w(1, 'CHIL', `@${c}@`));
  });

  // Sources
  for (const s of Object.values(state.sources)) {
    const xref = s.id.startsWith('@') ? s.id : `@${s.id}@`;
    lines.push(w(0, 'SOUR', undefined, xref));
    lines.push(w(1, 'TITL', s.title));
    if (s.citation) lines.push(w(1, 'PAGE', s.citation));
    if (s.url) lines.push(w(1, 'URL', s.url));
    if (s.description) lines.push(w(1, 'NOTE', s.description.replace(/\n/g, ' ')));
  }

  lines.push(w(0, 'TRLR'));
  return lines.join('\n');
}

function deriveFamilies(persons: Record<string, Person>) {
  const fams: { husbandId?: string; wifeId?: string; childIds: string[] }[] = [];
  const seen = new Set<string>();
  for (const p of Object.values(persons)) {
    for (const sp of p.spouseIds) {
      const key = [p.id, sp].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const a = persons[p.id];
      const b = persons[sp];
      const husband = a?.sex === 'male' ? a : b?.sex === 'male' ? b : a;
      const wife = a?.sex === 'female' ? a : b?.sex === 'female' ? b : b;
      const sharedChildren = (a?.childIds ?? []).filter((c) =>
        (b?.childIds ?? []).includes(c),
      );
      fams.push({
        husbandId: husband?.id,
        wifeId: wife?.id,
        childIds: sharedChildren,
      });
    }
    // Singletons with children but no spouse
    if (p.spouseIds.length === 0 && p.childIds.length > 0) {
      const key = `${p.id}|solo`;
      if (!seen.has(key)) {
        seen.add(key);
        fams.push({
          husbandId: p.sex === 'male' ? p.id : undefined,
          wifeId: p.sex === 'female' ? p.id : undefined,
          childIds: p.childIds,
        });
      }
    }
  }
  return fams;
}
