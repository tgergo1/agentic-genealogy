# Agentic Genealogy

An interactive, AI-assisted genealogy research workbench. Pairs
[WikiTree](https://www.wikitree.com/) (free, no key) and the
[FamilySearch API](https://developers.familysearch.org/main/docs/getting-started)
(optional) with Anthropic Claude or OpenAI to render aesthetic family
trees, analyze sources to the rigor of the Genealogical Proof Standard,
import / export GEDCOM, and break through brick walls — all from your
browser, with your data staying on your machine.

## What it does

- **Works out of the box, no genealogy-API keys required.** WikiTree's
  public API is free, anonymous, browser-friendly, and built into the app.
  You only need an AI key (Claude or OpenAI) to drive the agent.
- **WikiTree as a first-class data source.** Search profiles, fetch
  relatives, pull up to 10 generations of ancestors, read full biographies.
- **FamilySearch as an optional power-user surface.** If you've been
  approved through their
  [Compatible Solution Program](https://www.familysearch.org/developers/csp),
  paste in your app key and connect via OAuth 2.0 (PKCE). If not — that's
  fine, the rest of the app is fully functional.
- **Bring-your-own-keys for AI.** Claude or OpenAI keys live only in your
  browser's IndexedDB. Calls go directly browser → provider, no proxy.
- **Aesthetic pedigree renderer.** d3-hierarchy layout with smooth
  pan/zoom, generation-aligned cards, and ancestor/descendant toggles up
  to six generations.
- **GEDCOM 5.5.1 import/export.** A pragmatic subset that round-trips
  names, sex, birth/death/marriage facts, parent-child links, sources, and
  notes — so you can bring in trees from Ancestry, MyHeritage,
  RootsMagic, or anywhere else.
- **Agentic researcher.** The AI can call tools to read your local tree,
  search WikiTree, search FamilySearch (when configured), fetch ancestry,
  pull sources, and import remote records into your working tree.
- **Expert prompt library.** Five GPS-aligned templates: hypothesis
  generation, source analysis, brick-wall plans with FAN-club suggestions,
  conflict resolution, and chronological timelines.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173. The Settings dialog opens automatically the
first time so you can paste your keys.

### Get your keys

The only key you actually need is an AI key. Genealogy-data access works
without keys via WikiTree.

1. **Claude API key.** Get one from
   [console.anthropic.com](https://console.anthropic.com/). Paste into
   Settings → AI provider, choose Anthropic, pick a model
   (Sonnet 4.6 is the default; Opus 4.7 for hard reasoning).
2. **OpenAI API key (optional).** From
   [platform.openai.com](https://platform.openai.com/). Pick OpenAI in
   Settings if you prefer GPT-5 or GPT-4.1. Note OpenAI does not officially
   permit browser CORS to `api.openai.com`; if it's blocked, set Base URL
   to a local proxy.
3. **FamilySearch app key (optional, advanced).** FamilySearch's full API
   is gated behind the
   [Compatible Solution Program](https://www.familysearch.org/developers/csp),
   which most individual hobbyists can't pass. If you have or can obtain
   an app key, register a Web-type app at
   [developers.familysearch.org](https://developers.familysearch.org/),
   set the redirect URI to
   `http://localhost:5173/auth/familysearch/callback`, paste the app key
   into Settings → FamilySearch, and click **Connect FamilySearch**.

### Build a tree

- **Pull from WikiTree.** Toolbar → "WikiTree person" prompts for a
  WikiTree ID like `Smith-1` (find it in the URL of a WikiTree profile)
  and pulls that person plus immediate relatives. "WikiTree ancestry"
  walks up to 5 generations. WikiTree IDs become this app's primary
  internal IDs, so the agent can keep working with them seamlessly.
- **Pull from FamilySearch** (only if connected). Toolbar gains "My
  FamilySearch" and "FS ancestry" buttons after a successful OAuth.
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
    wikitree.ts           Free WikiTree API client + mapping
    familysearch.ts       Optional: OAuth (PKCE) + REST client + GEDCOM-X
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
