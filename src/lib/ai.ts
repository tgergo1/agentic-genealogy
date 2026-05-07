// Provider-agnostic AI client supporting Anthropic Claude and OpenAI.
//
// Browser-side usage: we POST directly to the provider with the user's API key,
// which means CORS must be allowed by the provider. Anthropic supports browser
// requests if the header `anthropic-dangerous-direct-browser-access: true` is
// sent. OpenAI's CORS is not officially supported for chat completions, but
// the user can run a local proxy / set a custom baseUrl in settings.

export type AiProviderId = 'anthropic' | 'openai';

export interface AiSettings {
  provider: AiProviderId;
  apiKey: string;
  model: string;
  baseUrl?: string; // optional override (proxy)
  maxTokens?: number;
  temperature?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string; // for role:'tool'
  toolName?: string; // for role:'tool'
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON schema
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface AiStreamEvent {
  type: 'text' | 'tool_call' | 'done' | 'error';
  text?: string;
  toolCall?: ToolCall;
  error?: string;
}

export interface AiCompletionResult {
  text: string;
  toolCalls: ToolCall[];
  stopReason?: string;
}

export const DEFAULT_MODELS: Record<AiProviderId, string[]> = {
  anthropic: [
    'claude-opus-4-7',
    'claude-sonnet-4-6',
    'claude-haiku-4-5-20251001',
    'claude-opus-4-6',
    'claude-sonnet-4-5',
  ],
  openai: ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4o', 'o4-mini'],
};

// ------------- Public completion API -------------

export async function complete(
  settings: AiSettings,
  messages: ChatMessage[],
  tools: ToolDef[] = [],
  signal?: AbortSignal,
): Promise<AiCompletionResult> {
  if (settings.provider === 'anthropic') {
    return completeAnthropic(settings, messages, tools, signal);
  }
  return completeOpenAI(settings, messages, tools, signal);
}

// ------------- Anthropic -------------

interface AnthMessage {
  role: 'user' | 'assistant';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'tool_use'; id: string; name: string; input: unknown }
        | {
            type: 'tool_result';
            tool_use_id: string;
            content: string;
            is_error?: boolean;
          }
      >;
}

function toAnthropicMessages(messages: ChatMessage[]): {
  system?: string;
  messages: AnthMessage[];
} {
  let system: string | undefined;
  const out: AnthMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      system = system ? `${system}\n\n${m.content}` : m.content;
      continue;
    }
    if (m.role === 'tool') {
      // attach to the most recent assistant message as a user-side tool_result
      out.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: m.toolCallId ?? '',
            content: m.content,
          },
        ],
      });
      continue;
    }
    if (m.role === 'assistant') {
      const content: AnthMessage['content'] = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const tc of m.toolCalls ?? []) {
        content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
      }
      out.push({ role: 'assistant', content: content.length ? content : '' });
      continue;
    }
    out.push({ role: 'user', content: m.content });
  }
  return { system, messages: out };
}

async function completeAnthropic(
  settings: AiSettings,
  messages: ChatMessage[],
  tools: ToolDef[],
  signal?: AbortSignal,
): Promise<AiCompletionResult> {
  const { system, messages: anth } = toAnthropicMessages(messages);
  const url = `${settings.baseUrl ?? 'https://api.anthropic.com'}/v1/messages`;
  const body = {
    model: settings.model,
    max_tokens: settings.maxTokens ?? 4096,
    temperature: settings.temperature ?? 0.4,
    system,
    messages: anth,
    tools: tools.length
      ? tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema,
        }))
      : undefined,
  };
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    content: Array<{ type: 'text' | 'tool_use'; text?: string; id?: string; name?: string; input?: unknown }>;
    stop_reason?: string;
  };
  let text = '';
  const toolCalls: ToolCall[] = [];
  for (const block of json.content ?? []) {
    if (block.type === 'text' && block.text) text += block.text;
    if (block.type === 'tool_use' && block.id && block.name) {
      toolCalls.push({ id: block.id, name: block.name, input: block.input });
    }
  }
  return { text, toolCalls, stopReason: json.stop_reason };
}

// ------------- OpenAI -------------

interface OAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

function toOpenAIMessages(messages: ChatMessage[]): OAIMessage[] {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return {
        role: 'tool',
        content: m.content,
        tool_call_id: m.toolCallId ?? '',
        name: m.toolName,
      };
    }
    if (m.role === 'assistant') {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls?.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.input ?? {}) },
        })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

async function completeOpenAI(
  settings: AiSettings,
  messages: ChatMessage[],
  tools: ToolDef[],
  signal?: AbortSignal,
): Promise<AiCompletionResult> {
  const url = `${settings.baseUrl ?? 'https://api.openai.com'}/v1/chat/completions`;
  const body = {
    model: settings.model,
    temperature: settings.temperature ?? 0.4,
    max_tokens: settings.maxTokens ?? 4096,
    messages: toOpenAIMessages(messages),
    tools: tools.length
      ? tools.map((t) => ({
          type: 'function' as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
          },
        }))
      : undefined,
  };
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    choices: Array<{
      message: {
        content?: string;
        tool_calls?: Array<{
          id: string;
          function: { name: string; arguments: string };
        }>;
      };
      finish_reason?: string;
    }>;
  };
  const choice = json.choices?.[0];
  const text = choice?.message?.content ?? '';
  const toolCalls: ToolCall[] = (choice?.message?.tool_calls ?? []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    input: safeParse(tc.function.arguments),
  }));
  return { text, toolCalls, stopReason: choice?.finish_reason };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
