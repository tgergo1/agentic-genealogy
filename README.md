# Agentic Genealogy

An interactive, AI-assisted genealogy research workbench. Combines the
[FamilySearch API](https://developers.familysearch.org/main/docs/getting-started)
with Anthropic Claude or OpenAI to render aesthetic family trees, analyze
sources to the rigor of the Genealogical Proof Standard, import / export
GEDCOM, and break through brick walls — all from your browser, with your
data staying on your machine.

## What it does

- **Bring-your-own-keys.** API keys for FamilySearch and Claude/OpenAI live
  only in your browser's IndexedDB. Nothing is proxied through a server.
- **FamilySearch OAuth (PKCE).** Public-client authorization code flow with
  S256 PKCE — no client secret required. Discovered automatically against
  `https://ident.familysearch.org/.well-known/openid-configuration`.
- **Aesthetic pedigree renderer.** d3-hierarchy layout with smooth pan/zoom,
  generation-aligned cards, and ancestor/descendant toggles up to six
  generations.
- **GEDCOM 5.5.1 import/export.** A pragmatic subset that round-trips
  names, sex, birth/death/marriage facts, parent-child links, sources, and
  notes.
- **Agentic researcher.** The AI can call tools — read your local tree,
  search FamilySearch persons and historical records, fetch ancestry,
  pull sources, and import remote records into your working tree.
- **Expert prompt library.** Five GPS-aligned templates: hypothesis
  generation, source analysis, brick-wall plans with FAN-club suggestions,
  conflict resolution, and chronological timelines.
- **Live source viewer.** Each person panel shows attached sources with
  citations and links back to the original record.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173. The Settings dialog opens automatically the
first time so you can paste your keys.

### Get your keys

1. **FamilySearch app key.** Sign in at
   [developers.familysearch.org](https://developers.familysearch.org/) →
   "My apps" → register a new app. Choose the **Web** type, set the
   redirect URI to `http://localhost:5173/auth/familysearch/callback`,
   and copy the app key into Settings → FamilySearch → App key.
2. **Claude API key.** Get one from
   [console.anthropic.com](https://console.anthropic.com/). Paste into
   Settings → AI provider, choose Anthropic, pick a model
   (Sonnet 4.6 is the default; Opus 4.7 for hard reasoning).
3. **OpenAI API key (optional).** From
   [platform.openai.com](https://platform.openai.com/). Pick OpenAI in
   Settings if you prefer GPT-5 or GPT-4.1. Note OpenAI does not officially
   permit browser CORS to `api.openai.com`; if it's blocked, set Base URL
   to a local proxy.

### Connect FamilySearch

Click **Connect FamilySearch** in Settings. You'll be sent to FamilySearch
to sign in, then bounced back to `/auth/familysearch/callback` where the
PKCE token exchange completes. The token (and refresh token, if you grant
`offline_access`) is stored locally in IndexedDB.

### Build a tree

- **Pull from FamilySearch.** Toolbar → "My FamilySearch" loads your
  person; "Pull ancestry" walks 5 generations up.
- **Import GEDCOM.** Toolbar → "Import GEDCOM". A sample is at
  [samples/family.ged](samples/family.ged).
- **Click around.** Selecting a person on the tree, person list, or
  family list makes them the focus for the chat agent.

### Use the researcher

- **Ask anything** in the chat panel. The agent has tools that read your
  local tree and can query FamilySearch on demand.
- **Use a template.** The chips above the chat run structured prompts
  (Hypotheses, Source analysis, Brick wall, Conflict resolution, Timeline)
  on the active person.
- **Watch the work.** Tool calls appear inline, with collapsible result
  payloads — so you can see exactly what the agent did.

## Architecture

```
src/
  lib/
    familysearch.ts       OAuth (PKCE) + REST client + GEDCOM-X subtypes
    gedcomx-mapper.ts     GEDCOM-X → internal model
    gedcom.ts             GEDCOM 5.5.1 import + export
    ai.ts                 Claude + OpenAI provider abstraction with tool use
    agent.ts              Tool definitions + agent loop
    storage.ts            IndexedDB key-value (idb-keyval)
    utils.ts
  prompts/system.ts       Base researcher system prompt + template library
  stores/                 Zustand stores: settings, tree, chat
  components/
    Toolbar.tsx
    settings/             Settings dialog + OAuth callback
    tree/TreeView.tsx     d3-hierarchy pedigree
    persons/              Person list + person details panel
    chat/ChatPanel.tsx    Agent chat with tool call rendering
    ui/                   Modal, Toast, IconButton
  types/genealogy.ts      Internal data model
  styles/index.css        Tailwind layer + custom components
```

The model is intentionally small and decoupled. The AI provider, the
FamilySearch client, the tree store, and the agent runtime can each be
swapped or extended without touching the others.

## Privacy and safety notes

- **Keys never leave your browser.** All API calls go directly from your
  browser to the relevant provider with your key.
- **The agent can mutate your local tree** (adding notes, importing
  FamilySearch persons). It cannot write anything back to FamilySearch
  by default — that surface intentionally hasn't been wired in yet.
- **Browser CORS.** Anthropic's API allows direct browser calls when the
  `anthropic-dangerous-direct-browser-access: true` header is sent (which
  this app does). OpenAI does not officially support browser CORS — use a
  local reverse proxy if you hit a CORS error, and set Base URL.

## Roadmap ideas

- Source attachment editor (reasoning + classification per GPS).
- Map view of life events.
- DNA match overlay (paste-in CSV from major testing companies).
- Timeline export to PDF.
- Multi-tree comparison and conflict surface.
- Optional encrypted backups to user-chosen cloud storage.

## License

See [LICENSE](LICENSE).
