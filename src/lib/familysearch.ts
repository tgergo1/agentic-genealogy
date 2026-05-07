// FamilySearch API client.
//
// Two auth modes are supported, both work for individual developers:
//
//  1. Authorization Code with PKCE (S256) — public client, no client_secret.
//     The user signs in to FamilySearch in their browser; we exchange the
//     code for an access token. This grants the user's full tree access.
//     See https://developers.familysearch.org/main/reference/getauthorizationpage
//     and https://developers.familysearch.org/main/reference/getaccesstoken.
//
//  2. Unauthenticated Session — no user login required. The token grants
//     access to the public-data subset (Places, Date Authority, Person
//     Search, Person Matches Query). Useful when you just want to
//     research without logging in. The token endpoint is the same as (1)
//     but with grant_type=unauthenticated_session.
//
// Endpoints use FamilySearch's CIS v3 paths (cis-web/oauth2/v3/...) which
// match the official reference docs and support both grant types above.
// The same paths exist on the production, beta, and integration hosts;
// only the hostname differs.
//
// API base differs from auth host:
//   production:  https://api.familysearch.org/platform
//   beta:        https://beta.familysearch.org/platform
//   integration: https://api-integ.familysearch.org/platform
//
// All resource requests carry: Authorization: Bearer <token>
// and Accept: application/x-gedcomx-v1+json.

import { readKey, writeKey, deleteKey, StorageKeys } from './storage';

export type FsEnvironment = 'production' | 'beta' | 'integration';

export interface FsEndpoints {
  authorization: string;
  token: string;
  apiBase: string;
}

export const FS_ENDPOINTS: Record<FsEnvironment, FsEndpoints> = {
  production: {
    authorization: 'https://ident.familysearch.org/cis-web/oauth2/v3/authorization',
    token: 'https://ident.familysearch.org/cis-web/oauth2/v3/token',
    apiBase: 'https://api.familysearch.org/platform',
  },
  beta: {
    authorization: 'https://identbeta.familysearch.org/cis-web/oauth2/v3/authorization',
    token: 'https://identbeta.familysearch.org/cis-web/oauth2/v3/token',
    apiBase: 'https://beta.familysearch.org/platform',
  },
  integration: {
    authorization: 'https://identint.familysearch.org/cis-web/oauth2/v3/authorization',
    token: 'https://identint.familysearch.org/cis-web/oauth2/v3/token',
    apiBase: 'https://api-integ.familysearch.org/platform',
  },
};

export const FS_ENV_LABEL: Record<FsEnvironment, string> = {
  production: 'Production (live)',
  beta: 'Beta (snapshot of production)',
  integration: 'Integration (sandbox, anyone can use)',
};

export interface FsConfig {
  clientId: string;
  redirectUri: string;
  environment: FsEnvironment;
}

export interface FsTokens {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  tokenType: string;
  expiresAt: number; // ms epoch
  scope?: string;
}

interface PkceState {
  verifier: string;
  challenge: string;
  state: string;
  config: FsConfig;
  scope: string;
  createdAt: number;
}

// ---------- PKCE helpers ----------

function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(byteLen = 32): string {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function sha256(input: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder().encode(input);
  return crypto.subtle.digest('SHA-256', enc);
}

async function makePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomString(32);
  const challenge = base64UrlEncode(await sha256(verifier));
  return { verifier, challenge };
}

// ---------- OAuth flow ----------

export async function startAuthFlow(
  config: FsConfig,
  scope = 'openid offline_access',
): Promise<string> {
  const { verifier, challenge } = await makePkce();
  const state = randomString(16);
  const ep = FS_ENDPOINTS[config.environment];

  const pkceState: PkceState = {
    verifier,
    challenge,
    state,
    config,
    scope,
    createdAt: Date.now(),
  };
  await writeKey(StorageKeys.FsPkce, pkceState);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${ep.authorization}?${params.toString()}`;
}

export async function completeAuthFlow(
  code: string,
  state: string,
): Promise<FsTokens> {
  const pkce = await readKey<PkceState>(StorageKeys.FsPkce);
  if (!pkce) throw new Error('No PKCE state found. Start auth flow first.');
  if (pkce.state !== state) throw new Error('OAuth state mismatch.');
  const ep = FS_ENDPOINTS[pkce.config.environment];

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: pkce.config.redirectUri,
    client_id: pkce.config.clientId,
    code_verifier: pkce.verifier,
  });

  const res = await fetch(ep.token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as TokenResponse;
  const tokens = parseTokenResponse(json);
  await writeKey(StorageKeys.FsTokens, tokens);
  await deleteKey(StorageKeys.FsPkce);
  return tokens;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

function parseTokenResponse(t: TokenResponse): FsTokens {
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    idToken: t.id_token,
    tokenType: t.token_type,
    expiresAt: Date.now() + t.expires_in * 1000,
    scope: t.scope,
  };
}

// Get an unauthenticated-session access token. No user login is involved.
// The token only grants access to the public-data subset (Places, Date
// Authority, Person Search, Person Matches Query). FamilySearch requires
// the client's IP address; we look it up via api.ipify.org since browsers
// don't have a way to read their own public IP.
export async function startUnauthenticatedSession(
  config: FsConfig,
  ipAddress?: string,
): Promise<FsTokens> {
  const ep = FS_ENDPOINTS[config.environment];
  const ip = ipAddress ?? (await fetchPublicIp());
  const body = new URLSearchParams({
    grant_type: 'unauthenticated_session',
    client_id: config.clientId,
    ip_address: ip,
  });
  const res = await fetch(ep.token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  if (!res.ok) {
    throw new Error(
      `Unauthenticated session request failed (${res.status}): ${await res.text()}`,
    );
  }
  const tokens = parseTokenResponse((await res.json()) as TokenResponse);
  await writeKey(StorageKeys.FsTokens, tokens);
  return tokens;
}

async function fetchPublicIp(): Promise<string> {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const json = (await res.json()) as { ip?: string };
    if (json.ip) return json.ip;
  } catch {
    /* fall through */
  }
  // FamilySearch accepts any well-formed IPv4; if the lookup fails we send
  // a sentinel so the request still proceeds rather than blocking the user.
  return '0.0.0.0';
}

export async function refreshTokens(
  config: FsConfig,
  refreshToken: string,
): Promise<FsTokens> {
  const ep = FS_ENDPOINTS[config.environment];
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
  });
  const res = await fetch(ep.token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  if (!res.ok) throw new Error(`Refresh failed (${res.status}): ${await res.text()}`);
  const tokens = parseTokenResponse((await res.json()) as TokenResponse);
  await writeKey(StorageKeys.FsTokens, tokens);
  return tokens;
}

export async function loadStoredTokens(): Promise<FsTokens | undefined> {
  return readKey<FsTokens>(StorageKeys.FsTokens);
}

export async function clearStoredTokens(): Promise<void> {
  await deleteKey(StorageKeys.FsTokens);
}

// ---------- API surface ----------

export class FamilySearchClient {
  constructor(public config: FsConfig, public tokens: FsTokens) {}

  private get base(): string {
    return FS_ENDPOINTS[this.config.environment].apiBase;
  }

  async ensureFresh(): Promise<void> {
    if (Date.now() >= this.tokens.expiresAt - 30_000 && this.tokens.refreshToken) {
      this.tokens = await refreshTokens(this.config, this.tokens.refreshToken);
    }
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    await this.ensureFresh();
    const url = path.startsWith('http') ? path : `${this.base}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.tokens.accessToken}`,
      Accept: 'application/x-gedcomx-v1+json',
      ...((init.headers as Record<string, string>) ?? {}),
    };
    const res = await fetch(url, { ...init, headers });
    if (res.status === 204) return undefined as unknown as T;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new FsApiError(res.status, `${res.status} ${res.statusText}: ${text}`, path);
    }
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('json')) return (await res.json()) as T;
    return (await res.text()) as unknown as T;
  }

  // --- User & current person ---
  getCurrentUser() {
    return this.request<unknown>('/users/current');
  }
  getCurrentPerson() {
    return this.request<GxRoot>('/tree/current-person');
  }

  // --- Person ---
  getPerson(personId: string) {
    return this.request<GxRoot>(`/tree/persons/${encodeURIComponent(personId)}`);
  }
  getPersonWithRelationships(personId: string) {
    return this.request<GxRoot>(
      `/tree/persons-with-relationships?person=${encodeURIComponent(personId)}`,
    );
  }
  getPersonAncestry(personId: string, generations = 4) {
    return this.request<GxRoot>(
      `/tree/ancestry?person=${encodeURIComponent(personId)}&generations=${generations}`,
    );
  }
  getPersonDescendancy(personId: string, generations = 2) {
    return this.request<GxRoot>(
      `/tree/descendancy?person=${encodeURIComponent(personId)}&generations=${generations}`,
    );
  }
  getPersonSources(personId: string) {
    return this.request<GxRoot>(`/tree/persons/${encodeURIComponent(personId)}/sources`);
  }
  getPersonNotes(personId: string) {
    return this.request<GxRoot>(`/tree/persons/${encodeURIComponent(personId)}/notes`);
  }
  getPersonMatches(personId: string) {
    return this.request<GxRoot>(`/tree/persons/${encodeURIComponent(personId)}/matches`);
  }
  getPersonChanges(personId: string) {
    return this.request<GxRoot>(`/tree/persons/${encodeURIComponent(personId)}/changes`);
  }

  // --- Search ---
  searchPersons(params: SearchPersonParams) {
    const qs = new URLSearchParams();
    const q = Object.entries(params)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${k}:"${String(v).replace(/"/g, '\\"')}"`)
      .join(' ');
    if (q) qs.set('q', q);
    return this.request<GxRoot>(`/tree/search?${qs.toString()}`);
  }

  // --- Places ---
  searchPlaces(query: string) {
    return this.request<GxRoot>(`/places/search?q=${encodeURIComponent(query)}`);
  }

  // --- Records ---
  searchRecords(params: Record<string, string>) {
    const qs = new URLSearchParams(params);
    return this.request<GxRoot>(`/records/search?${qs.toString()}`);
  }

  // --- Memories ---
  getPersonMemories(personId: string) {
    return this.request<GxRoot>(
      `/tree/persons/${encodeURIComponent(personId)}/memories`,
    );
  }
}

export class FsApiError extends Error {
  constructor(public status: number, message: string, public path?: string) {
    super(message);
    this.name = 'FsApiError';
  }
}

export interface SearchPersonParams {
  givenName?: string;
  surname?: string;
  birthDate?: string;
  birthPlace?: string;
  deathDate?: string;
  deathPlace?: string;
  fatherGivenName?: string;
  fatherSurname?: string;
  motherGivenName?: string;
  motherSurname?: string;
  spouseGivenName?: string;
  spouseSurname?: string;
}

// ---------- GEDCOM-X minimal types (subset) ----------
// FamilySearch returns GEDCOM-X JSON. We model only the fields we use.

export interface GxRoot {
  persons?: GxPerson[];
  relationships?: GxRelationship[];
  sourceDescriptions?: GxSourceDescription[];
  places?: GxPlace[];
  notes?: GxNote[];
  // search results
  entries?: GxEntry[];
}

export interface GxEntry {
  id?: string;
  score?: number;
  content?: GxRoot;
}

export interface GxPerson {
  id: string;
  living?: boolean;
  gender?: { type?: string };
  names?: GxName[];
  facts?: GxFact[];
  display?: {
    name?: string;
    gender?: string;
    lifespan?: string;
    birthDate?: string;
    birthPlace?: string;
    deathDate?: string;
    deathPlace?: string;
    ascendancyNumber?: string;
    descendancyNumber?: string;
  };
}

export interface GxName {
  preferred?: boolean;
  nameForms?: { fullText?: string; parts?: { type?: string; value?: string }[] }[];
}

export interface GxFact {
  id?: string;
  type?: string;
  date?: { original?: string; formal?: string };
  place?: { original?: string; normalized?: { value?: string }[] };
  value?: string;
  sources?: { description?: string }[];
}

export interface GxRelationship {
  id?: string;
  type?: 'http://gedcomx.org/Couple' | 'http://gedcomx.org/ParentChild' | string;
  person1?: { resourceId?: string; resource?: string };
  person2?: { resourceId?: string; resource?: string };
  facts?: GxFact[];
}

export interface GxSourceDescription {
  id?: string;
  about?: string;
  citations?: { value?: string }[];
  titles?: { value?: string }[];
  notes?: { text?: string }[];
}

export interface GxPlace {
  id?: string;
  names?: { value?: string }[];
  latitude?: number;
  longitude?: number;
}

export interface GxNote {
  id?: string;
  subject?: string;
  text?: string;
}
