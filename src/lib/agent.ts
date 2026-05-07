// The agent runtime: wires the AI model to a set of genealogy-specific tools.
//
// The model can call these tools to actively pull data from the local tree,
// query FamilySearch, and add facts/sources/notes to the working tree.

import type { ChatMessage, ToolCall, ToolDef } from './ai';
import type { GenealogyState, Person } from '../types/genealogy';
import { complete, type AiSettings } from './ai';
import type { FamilySearchClient } from './familysearch';
import { mapGedcomxRoot } from './gedcomx-mapper';
import { WikiTree, mapWtProfiles, mapWtRelatives } from './wikitree';

export interface AgentDeps {
  ai: AiSettings;
  fs?: FamilySearchClient;
  // WikiTree is always available — no key required, anonymous public reads.
  // Setting this flag to false disables it (e.g., user prefers offline-only).
  wtEnabled?: boolean;
  getState: () => GenealogyState;
  setState: (mutate: (s: GenealogyState) => GenealogyState) => void;
  activePersonId?: string;
}

export const TOOLS: ToolDef[] = [
  {
    name: 'get_active_person',
    description:
      'Return the full record of the currently selected person, including names, sex, facts, parent/spouse/child IDs, and source references.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_person',
    description: 'Return a person record by internal ID.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'list_persons',
    description: 'List up to N persons in the working tree, optionally filtered by surname or name substring.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        nameContains: { type: 'string' },
      },
    },
  },
  {
    name: 'get_relatives',
    description:
      'Return the parents, spouses, and children of a person by internal ID, with their key facts.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'fs_search_persons',
    description:
      'Search FamilySearch tree for persons matching name/birth/death/place criteria. Returns up to 20 matches.',
    inputSchema: {
      type: 'object',
      properties: {
        givenName: { type: 'string' },
        surname: { type: 'string' },
        birthDate: { type: 'string' },
        birthPlace: { type: 'string' },
        deathDate: { type: 'string' },
        deathPlace: { type: 'string' },
        fatherSurname: { type: 'string' },
        motherSurname: { type: 'string' },
        spouseSurname: { type: 'string' },
      },
    },
  },
  {
    name: 'fs_get_person',
    description:
      'Fetch a FamilySearch person by their PID, returning facts, names, and basic relationships.',
    inputSchema: {
      type: 'object',
      properties: { pid: { type: 'string' } },
      required: ['pid'],
    },
  },
  {
    name: 'fs_get_ancestry',
    description:
      'Fetch the ancestry pedigree for a FamilySearch person up to N generations (default 4, max 8).',
    inputSchema: {
      type: 'object',
      properties: {
        pid: { type: 'string' },
        generations: { type: 'number' },
      },
      required: ['pid'],
    },
  },
  {
    name: 'fs_get_sources',
    description: 'List all sources currently attached to a FamilySearch person.',
    inputSchema: {
      type: 'object',
      properties: { pid: { type: 'string' } },
      required: ['pid'],
    },
  },
  {
    name: 'fs_search_records',
    description:
      'Search FamilySearch historical records (census, vital, church, etc.) by keyword and place.',
    inputSchema: {
      type: 'object',
      properties: {
        givenName: { type: 'string' },
        surname: { type: 'string' },
        birthYear: { type: 'string' },
        deathYear: { type: 'string' },
        place: { type: 'string' },
        collection: { type: 'string' },
      },
    },
  },
  {
    name: 'add_note_to_person',
    description: 'Append a research note to a person in the working tree.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['id', 'note'],
    },
  },
  {
    name: 'import_fs_person_into_tree',
    description:
      'Fetch a FamilySearch person (and immediate relationships) and merge them into the working tree as a new local record.',
    inputSchema: {
      type: 'object',
      properties: { pid: { type: 'string' } },
      required: ['pid'],
    },
  },
  // ---------- WikiTree tools (free, no key required) ----------
  {
    name: 'wt_search_persons',
    description:
      'Search WikiTree for person profiles by name, dates, and locations. WikiTree is a free public collaborative tree — no API key needed. Returns up to 20 matches with WikiTree IDs (e.g. "Clemens-1").',
    inputSchema: {
      type: 'object',
      properties: {
        FirstName: { type: 'string' },
        LastName: { type: 'string' },
        BirthDate: { type: 'string', description: 'YYYY-MM-DD or YYYY' },
        DeathDate: { type: 'string' },
        BirthLocation: { type: 'string' },
        DeathLocation: { type: 'string' },
        Gender: { type: 'string', enum: ['Male', 'Female'] },
        fatherFirstName: { type: 'string' },
        fatherLastName: { type: 'string' },
        motherFirstName: { type: 'string' },
        motherLastName: { type: 'string' },
      },
    },
  },
  {
    name: 'wt_get_profile',
    description:
      'Fetch a WikiTree profile by its WikiTree ID (e.g. "Clemens-1") with names, dates, locations, sex, and parent IDs.',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
    },
  },
  {
    name: 'wt_get_relatives',
    description:
      'Fetch the parents, spouses, and children of a WikiTree person by ID. Returns a JSON bundle.',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
    },
  },
  {
    name: 'wt_get_ancestors',
    description:
      'Fetch up to N generations of WikiTree ancestors for a person (default 4, max 10).',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        depth: { type: 'number' },
      },
      required: ['key'],
    },
  },
  {
    name: 'wt_get_bio',
    description:
      'Fetch the long-form biography text for a WikiTree profile, in WikiTree wiki format.',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
    },
  },
  {
    name: 'import_wt_person_into_tree',
    description:
      'Fetch a WikiTree person plus their immediate relatives (parents, spouses, children) and merge into the working tree.',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
    },
  },
  {
    name: 'import_wt_ancestors_into_tree',
    description:
      'Fetch up to N generations of WikiTree ancestors and merge into the working tree.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        depth: { type: 'number' },
      },
      required: ['key'],
    },
  },
];

function summarizePerson(p?: Person): unknown {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name.full ?? `${p.name.given ?? ''} ${p.name.surname ?? ''}`.trim(),
    sex: p.sex,
    living: p.living,
    facts: p.facts.map((f) => ({
      type: f.type,
      date: f.date?.original,
      place: f.place?.original,
    })),
    parentIds: p.parentIds,
    spouseIds: p.spouseIds,
    childIds: p.childIds,
    fsId: p.fsId,
    notes: p.notes,
  };
}

export async function runTool(call: ToolCall, deps: AgentDeps): Promise<string> {
  const input = (call.input ?? {}) as Record<string, unknown>;
  const state = deps.getState();
  try {
    switch (call.name) {
      case 'get_active_person': {
        const p = deps.activePersonId ? state.persons[deps.activePersonId] : undefined;
        return JSON.stringify(summarizePerson(p));
      }
      case 'get_person': {
        const p = state.persons[String(input.id)];
        return JSON.stringify(summarizePerson(p));
      }
      case 'list_persons': {
        const limit = Number(input.limit ?? 25);
        const needle = String(input.nameContains ?? '').toLowerCase();
        const list = Object.values(state.persons)
          .filter((p) =>
            !needle ||
            (p.name.full ?? '').toLowerCase().includes(needle) ||
            (p.name.surname ?? '').toLowerCase().includes(needle),
          )
          .slice(0, limit)
          .map(summarizePerson);
        return JSON.stringify(list);
      }
      case 'get_relatives': {
        const p = state.persons[String(input.id)];
        if (!p) return JSON.stringify({ error: 'unknown person' });
        return JSON.stringify({
          parents: p.parentIds.map((id) => summarizePerson(state.persons[id])).filter(Boolean),
          spouses: p.spouseIds.map((id) => summarizePerson(state.persons[id])).filter(Boolean),
          children: p.childIds.map((id) => summarizePerson(state.persons[id])).filter(Boolean),
        });
      }
      case 'fs_search_persons': {
        if (!deps.fs) return JSON.stringify({ error: 'FamilySearch not connected' });
        const root = await deps.fs.searchPersons(input);
        const summary = (root.entries ?? []).slice(0, 20).map((e) => ({
          id: e.id,
          score: e.score,
          person: e.content?.persons?.[0]?.display,
        }));
        return JSON.stringify(summary);
      }
      case 'fs_get_person': {
        if (!deps.fs) return JSON.stringify({ error: 'FamilySearch not connected' });
        const root = await deps.fs.getPersonWithRelationships(String(input.pid));
        return JSON.stringify(root);
      }
      case 'fs_get_ancestry': {
        if (!deps.fs) return JSON.stringify({ error: 'FamilySearch not connected' });
        const gens = Math.min(Math.max(Number(input.generations ?? 4), 1), 8);
        const root = await deps.fs.getPersonAncestry(String(input.pid), gens);
        return JSON.stringify({
          persons: (root.persons ?? []).map((p) => ({
            id: p.id,
            display: p.display,
            ascendancy: p.display?.ascendancyNumber,
          })),
        });
      }
      case 'fs_get_sources': {
        if (!deps.fs) return JSON.stringify({ error: 'FamilySearch not connected' });
        const root = await deps.fs.getPersonSources(String(input.pid));
        return JSON.stringify(
          (root.sourceDescriptions ?? []).map((s) => ({
            id: s.id,
            title: s.titles?.[0]?.value,
            citation: s.citations?.[0]?.value,
            about: s.about,
          })),
        );
      }
      case 'fs_search_records': {
        if (!deps.fs) return JSON.stringify({ error: 'FamilySearch not connected' });
        const params: Record<string, string> = {};
        for (const [k, v] of Object.entries(input)) {
          if (v != null && v !== '') params[`q.${k}`] = String(v);
        }
        const root = await deps.fs.searchRecords(params);
        return JSON.stringify((root.entries ?? []).slice(0, 20));
      }
      case 'add_note_to_person': {
        const id = String(input.id);
        const note = String(input.note ?? '');
        deps.setState((s) => {
          const p = s.persons[id];
          if (!p) return s;
          return {
            ...s,
            persons: {
              ...s.persons,
              [id]: { ...p, notes: [...(p.notes ?? []), note], updatedAt: Date.now() },
            },
          };
        });
        return JSON.stringify({ ok: true });
      }
      case 'import_fs_person_into_tree': {
        if (!deps.fs) return JSON.stringify({ error: 'FamilySearch not connected' });
        const root = await deps.fs.getPersonWithRelationships(String(input.pid));
        const mapped = mapGedcomxRoot(root);
        deps.setState((s) => ({
          ...s,
          persons: { ...s.persons, ...mapped.persons },
        }));
        return JSON.stringify({
          imported: Object.keys(mapped.persons).length,
          ids: Object.keys(mapped.persons),
        });
      }

      // ---------- WikiTree ----------
      case 'wt_search_persons': {
        if (deps.wtEnabled === false) return JSON.stringify({ error: 'WikiTree disabled' });
        const matches = await WikiTree.searchPerson(input);
        return JSON.stringify(
          matches.map((p) => ({
            wikiTreeId: p.Name,
            name: [p.FirstName, p.MiddleName, p.LastNameAtBirth].filter(Boolean).join(' '),
            birth: p.BirthDate || p.BirthDateDecade,
            birthPlace: p.BirthLocation,
            death: p.DeathDate || p.DeathDateDecade,
            deathPlace: p.DeathLocation,
            gender: p.Gender,
            url: p.Name ? WikiTree.profileUrl(p.Name) : undefined,
          })),
        );
      }
      case 'wt_get_profile': {
        if (deps.wtEnabled === false) return JSON.stringify({ error: 'WikiTree disabled' });
        const profile = await WikiTree.getProfile(String(input.key));
        return JSON.stringify(profile ?? { error: 'not found' });
      }
      case 'wt_get_relatives': {
        if (deps.wtEnabled === false) return JSON.stringify({ error: 'WikiTree disabled' });
        const bundle = await WikiTree.getRelatives(String(input.key));
        return JSON.stringify(bundle ?? { error: 'not found' });
      }
      case 'wt_get_ancestors': {
        if (deps.wtEnabled === false) return JSON.stringify({ error: 'WikiTree disabled' });
        const list = await WikiTree.getAncestors(String(input.key), Number(input.depth ?? 4));
        return JSON.stringify(list);
      }
      case 'wt_get_bio': {
        if (deps.wtEnabled === false) return JSON.stringify({ error: 'WikiTree disabled' });
        const bio = await WikiTree.getBio(String(input.key));
        return JSON.stringify({ key: input.key, bio: bio ?? null });
      }
      case 'import_wt_person_into_tree': {
        if (deps.wtEnabled === false) return JSON.stringify({ error: 'WikiTree disabled' });
        const bundle = await WikiTree.getRelatives(String(input.key));
        if (!bundle) return JSON.stringify({ error: 'not found' });
        const mapped = mapWtRelatives(bundle);
        deps.setState((s) => ({
          ...s,
          persons: { ...s.persons, ...mapped.persons },
        }));
        return JSON.stringify({
          imported: Object.keys(mapped.persons).length,
          ids: Object.keys(mapped.persons),
        });
      }
      case 'import_wt_ancestors_into_tree': {
        if (deps.wtEnabled === false) return JSON.stringify({ error: 'WikiTree disabled' });
        const list = await WikiTree.getAncestors(
          String(input.key),
          Number(input.depth ?? 4),
        );
        const mapped = mapWtProfiles(list, String(input.key));
        deps.setState((s) => ({
          ...s,
          persons: { ...s.persons, ...mapped.persons },
        }));
        return JSON.stringify({
          imported: Object.keys(mapped.persons).length,
          ids: Object.keys(mapped.persons),
        });
      }

      default:
        return JSON.stringify({ error: `unknown tool ${call.name}` });
    }
  } catch (err) {
    return JSON.stringify({ error: String((err as Error).message) });
  }
}

// Run an agent loop: keep calling the model and executing its tool calls
// until the model either stops or we hit a safety cap.
export interface AgentRunStep {
  message: ChatMessage;
}

export async function runAgent(
  initialMessages: ChatMessage[],
  deps: AgentDeps,
  onStep?: (step: AgentRunStep) => void,
  maxIterations = 8,
): Promise<ChatMessage[]> {
  const messages = [...initialMessages];
  for (let i = 0; i < maxIterations; i++) {
    const { text, toolCalls, stopReason } = await complete(deps.ai, messages, TOOLS);
    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: text,
      toolCalls: toolCalls.length ? toolCalls : undefined,
    };
    messages.push(assistantMsg);
    onStep?.({ message: assistantMsg });
    if (!toolCalls.length) return messages;
    for (const tc of toolCalls) {
      const result = await runTool(tc, deps);
      const toolMsg: ChatMessage = {
        role: 'tool',
        content: result,
        toolCallId: tc.id,
        toolName: tc.name,
      };
      messages.push(toolMsg);
      onStep?.({ message: toolMsg });
    }
    if (stopReason && stopReason !== 'tool_use' && stopReason !== 'tool_calls') {
      return messages;
    }
  }
  return messages;
}
