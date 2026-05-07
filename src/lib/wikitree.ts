// WikiTree API client.
//
// Why this exists: FamilySearch's full API is gated behind their Compatible
// Solution Program — most individual researchers cannot get an app key.
// WikiTree's API is free, open, and browser-friendly:
//
//   - Endpoint: https://api.wikitree.com/api.php
//   - Anonymous access works for the (vast majority of) public profiles.
//   - CORS is supported, so we can call it directly from the browser.
//   - Optional login via clientLogin gives access to the calling user's
//     trusted-list profiles (we don't implement that here — it requires the
//     user's WikiTree password, which we won't ask for).
//
// We always send an `appId` so requests don't fall under the strict
// anonymous rate limit, and a cache-buster `_` so intermediaries don't
// serve stale responses.

import type { Person, Sex } from '../types/genealogy';

const API_URL = 'https://api.wikitree.com/api.php';
const APP_ID = 'agentic-genealogy';

interface WtRequestParams {
  action: string;
  key?: string;
  keys?: string;
  depth?: number;
  fields?: string;
  bioFormat?: string;
  resolveRedirect?: number;
  // searchPerson params
  FirstName?: string;
  LastName?: string;
  BirthDate?: string;
  DeathDate?: string;
  BirthLocation?: string;
  DeathLocation?: string;
  Gender?: string;
  fatherFirstName?: string;
  fatherLastName?: string;
  motherFirstName?: string;
  motherLastName?: string;
  // pagination
  start?: number;
  limit?: number;
  // getRelatives
  getParents?: number;
  getChildren?: number;
  getSpouses?: number;
  getSiblings?: number;
}

const DEFAULT_FIELDS = [
  'Id',
  'PageId',
  'Name',
  'FirstName',
  'MiddleName',
  'LastNameAtBirth',
  'LastNameCurrent',
  'Suffix',
  'Prefix',
  'BirthDate',
  'DeathDate',
  'BirthLocation',
  'DeathLocation',
  'BirthDateDecade',
  'DeathDateDecade',
  'Gender',
  'IsLiving',
  'Father',
  'Mother',
  'Privacy_IsAtLeastPublic',
  'HasChildren',
].join(',');

async function wtRequest(params: WtRequestParams): Promise<unknown> {
  const body = new URLSearchParams({
    appId: APP_ID,
    format: 'json',
    _: String(Date.now()),
    ...Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '') as [string, string][],
    ),
  });
  const res = await fetch(API_URL, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!res.ok) throw new Error(`WikiTree ${res.status}: ${await res.text()}`);
  return res.json();
}

// ---- Public types ----

export interface WtProfile {
  Id?: number;
  PageId?: number;
  Name?: string; // WikiTree ID like "Clemens-1"
  FirstName?: string;
  MiddleName?: string;
  LastNameAtBirth?: string;
  LastNameCurrent?: string;
  Prefix?: string;
  Suffix?: string;
  BirthDate?: string; // YYYY-MM-DD with 0s for unknown parts
  DeathDate?: string;
  BirthDateDecade?: string;
  DeathDateDecade?: string;
  BirthLocation?: string;
  DeathLocation?: string;
  Gender?: string; // "Male" | "Female" | ""
  IsLiving?: number;
  Father?: number;
  Mother?: number;
  HasChildren?: number;
  Privacy_IsAtLeastPublic?: number;
}

export interface WtRelativeBundle {
  Parents?: Record<string, WtProfile>;
  Spouses?: Record<string, WtProfile>;
  Children?: Record<string, WtProfile>;
  Siblings?: Record<string, WtProfile>;
}

// ---- Public client ----

export const WikiTree = {
  async getProfile(key: string, fields = DEFAULT_FIELDS): Promise<WtProfile | undefined> {
    const res = (await wtRequest({ action: 'getProfile', key, fields })) as Array<{
      profile?: WtProfile;
      status?: number | string;
    }>;
    return res?.[0]?.profile;
  },

  async getPerson(key: string, fields = DEFAULT_FIELDS): Promise<WtProfile | undefined> {
    const res = (await wtRequest({ action: 'getPerson', key, fields })) as Array<{
      person?: WtProfile;
      status?: number | string;
    }>;
    return res?.[0]?.person;
  },

  async getRelatives(
    key: string,
    opts: { parents?: boolean; children?: boolean; spouses?: boolean; siblings?: boolean } = {},
  ): Promise<{ profile: WtProfile; relatives: WtRelativeBundle } | undefined> {
    const { parents = true, children = true, spouses = true, siblings = false } = opts;
    const res = (await wtRequest({
      action: 'getRelatives',
      keys: key,
      fields: DEFAULT_FIELDS,
      getParents: parents ? 1 : 0,
      getChildren: children ? 1 : 0,
      getSpouses: spouses ? 1 : 0,
      getSiblings: siblings ? 1 : 0,
    })) as Array<{
      items?: Array<{ person?: WtProfile & WtRelativeBundle }>;
    }>;
    const item = res?.[0]?.items?.[0]?.person;
    if (!item) return undefined;
    const { Parents, Spouses, Children, Siblings, ...profile } = item;
    return {
      profile,
      relatives: { Parents, Spouses, Children, Siblings },
    };
  },

  async getAncestors(key: string, depth = 4): Promise<WtProfile[]> {
    const safeDepth = Math.min(Math.max(depth, 1), 10);
    const res = (await wtRequest({
      action: 'getAncestors',
      key,
      depth: safeDepth,
      fields: DEFAULT_FIELDS,
    })) as Array<{ ancestors?: WtProfile[] }>;
    return res?.[0]?.ancestors ?? [];
  },

  async getDescendants(key: string, depth = 3): Promise<WtProfile[]> {
    const safeDepth = Math.min(Math.max(depth, 1), 5);
    const res = (await wtRequest({
      action: 'getDescendants',
      key,
      depth: safeDepth,
      fields: DEFAULT_FIELDS,
    })) as Array<{ descendants?: WtProfile[] }>;
    return res?.[0]?.descendants ?? [];
  },

  async searchPerson(params: {
    FirstName?: string;
    LastName?: string;
    BirthDate?: string;
    DeathDate?: string;
    BirthLocation?: string;
    DeathLocation?: string;
    Gender?: string;
    fatherFirstName?: string;
    fatherLastName?: string;
    motherFirstName?: string;
    motherLastName?: string;
    limit?: number;
  }): Promise<WtProfile[]> {
    const res = (await wtRequest({
      action: 'searchPerson',
      fields: DEFAULT_FIELDS,
      limit: params.limit ?? 20,
      ...params,
    })) as Array<{ matches?: WtProfile[] }>;
    return res?.[0]?.matches ?? [];
  },

  async getBio(key: string): Promise<string | undefined> {
    const res = (await wtRequest({ action: 'getBio', key, bioFormat: 'wiki' })) as Array<{
      bio?: string;
    }>;
    return res?.[0]?.bio;
  },

  profileUrl(name: string): string {
    return `https://www.wikitree.com/wiki/${encodeURIComponent(name)}`;
  },
};

// ---- Mapping into the internal model ----

function parseWtDate(s?: string): { original?: string; year?: number } | undefined {
  if (!s || s === '0000-00-00') return undefined;
  const m = s.match(/^(-?\d{4})/);
  return { original: s, year: m ? parseInt(m[1], 10) : undefined };
}

function wtSex(g?: string): Sex {
  if (g === 'Male') return 'male';
  if (g === 'Female') return 'female';
  return 'unknown';
}

function fullNameOf(p: WtProfile): string {
  const parts = [p.Prefix, p.FirstName, p.MiddleName, p.LastNameAtBirth, p.Suffix]
    .filter(Boolean)
    .join(' ')
    .trim();
  return parts || p.Name || 'Unknown';
}

function profileToPerson(p: WtProfile): Person {
  const id = p.Name ?? `wt_${p.Id ?? Math.random().toString(36).slice(2)}`;
  const facts = [];
  const bd = parseWtDate(p.BirthDate);
  if (bd || p.BirthLocation) {
    facts.push({
      id: `${id}_birth`,
      type: 'Birth' as const,
      date: bd,
      place: p.BirthLocation ? { original: p.BirthLocation } : undefined,
    });
  }
  const dd = parseWtDate(p.DeathDate);
  if (dd || p.DeathLocation) {
    facts.push({
      id: `${id}_death`,
      type: 'Death' as const,
      date: dd,
      place: p.DeathLocation ? { original: p.DeathLocation } : undefined,
    });
  }
  return {
    id,
    fsId: undefined,
    name: {
      given: [p.FirstName, p.MiddleName].filter(Boolean).join(' ') || undefined,
      surname: p.LastNameAtBirth ?? p.LastNameCurrent ?? undefined,
      prefix: p.Prefix ?? undefined,
      suffix: p.Suffix ?? undefined,
      full: fullNameOf(p),
    },
    sex: wtSex(p.Gender),
    living: p.IsLiving === 1,
    facts,
    parentIds: [],
    spouseIds: [],
    childIds: [],
    notes: [`WikiTree ID: ${p.Name ?? p.Id} (https://www.wikitree.com/wiki/${p.Name ?? ''})`],
    updatedAt: Date.now(),
  };
}

export interface WtImportResult {
  persons: Record<string, Person>;
  rootId?: string;
}

// Map a flat list of WikiTree profiles (e.g. from getAncestors / getDescendants
// results) into our internal model, threading parent/child links via the
// Father/Mother numeric IDs that WikiTree returns.
export function mapWtProfiles(profiles: WtProfile[], rootName?: string): WtImportResult {
  const byId: Record<number, WtProfile> = {};
  const persons: Record<string, Person> = {};
  for (const p of profiles) {
    if (p.Id != null) byId[p.Id] = p;
  }
  for (const p of profiles) {
    const person = profileToPerson(p);
    persons[person.id] = person;
  }
  // Re-link parent / child via Father / Mother IDs
  for (const p of profiles) {
    const me = persons[p.Name ?? `wt_${p.Id ?? ''}`];
    if (!me) continue;
    if (p.Father && byId[p.Father]) {
      const dad = persons[byId[p.Father].Name ?? `wt_${p.Father}`];
      if (dad) {
        me.parentIds.push(dad.id);
        dad.childIds.push(me.id);
      }
    }
    if (p.Mother && byId[p.Mother]) {
      const mom = persons[byId[p.Mother].Name ?? `wt_${p.Mother}`];
      if (mom) {
        me.parentIds.push(mom.id);
        mom.childIds.push(me.id);
      }
    }
  }
  for (const p of Object.values(persons)) {
    p.parentIds = [...new Set(p.parentIds)];
    p.childIds = [...new Set(p.childIds)];
    p.spouseIds = [...new Set(p.spouseIds)];
  }
  return { persons, rootId: rootName };
}

export function mapWtRelatives(
  bundle: { profile: WtProfile; relatives: WtRelativeBundle },
): WtImportResult {
  const all: WtProfile[] = [bundle.profile];
  const collect = (rec?: Record<string, WtProfile>) => {
    if (!rec) return;
    for (const v of Object.values(rec)) all.push(v);
  };
  collect(bundle.relatives.Parents);
  collect(bundle.relatives.Spouses);
  collect(bundle.relatives.Children);
  collect(bundle.relatives.Siblings);
  const result = mapWtProfiles(all, bundle.profile.Name);
  // Spouses + children aren't connected via Father/Mother in this bundle,
  // so wire them up explicitly.
  const meId = bundle.profile.Name ?? `wt_${bundle.profile.Id ?? ''}`;
  const me = result.persons[meId];
  if (me) {
    for (const sp of Object.values(bundle.relatives.Spouses ?? {})) {
      const spId = sp.Name ?? `wt_${sp.Id ?? ''}`;
      if (result.persons[spId]) {
        me.spouseIds.push(spId);
        result.persons[spId].spouseIds.push(meId);
      }
    }
    for (const ch of Object.values(bundle.relatives.Children ?? {})) {
      const chId = ch.Name ?? `wt_${ch.Id ?? ''}`;
      if (result.persons[chId]) {
        me.childIds.push(chId);
        result.persons[chId].parentIds.push(meId);
      }
    }
    me.spouseIds = [...new Set(me.spouseIds)];
    me.childIds = [...new Set(me.childIds)];
  }
  return result;
}
