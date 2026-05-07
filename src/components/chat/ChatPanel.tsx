import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Wand2, Loader2, Hammer, Sparkles, Trash2, Plus } from 'lucide-react';
import { useChats } from '../../stores/chat';
import { useTree } from '../../stores/tree';
import { useSettings } from '../../stores/settings';
import { useToasts } from '../ui/Toast';
import { runAgent } from '../../lib/agent';
import { FamilySearchClient } from '../../lib/familysearch';
import { BASE_RESEARCHER_SYSTEM, PROMPT_LIBRARY } from '../../prompts/system';
import type { ChatMessage } from '../../lib/ai';
import { cn } from '../../lib/utils';

export function ChatPanel() {
  const { sessions, activeId, newSession, setActive, appendMessage, deleteSession } = useChats();
  const tree = useTree();
  const { ai, fsConfig, fsTokens } = useSettings();
  const { push } = useToasts();
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const session = activeId ? sessions[activeId] : undefined;

  const fs = useMemo(
    () => (fsTokens ? new FamilySearchClient(fsConfig, fsTokens) : undefined),
    [fsConfig, fsTokens],
  );

  useEffect(() => {
    if (!activeId && Object.keys(sessions).length === 0) {
      newSession('First research session');
    } else if (!activeId && Object.keys(sessions).length > 0) {
      setActive(Object.keys(sessions)[0]);
    }
  }, [activeId, sessions, newSession, setActive]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [session?.messages.length]);

  async function send(text: string, isPromptTemplate = false) {
    if (!session) return;
    if (!ai.apiKey) {
      push('error', 'Add your AI API key in Settings.');
      return;
    }

    const userMsg: ChatMessage = { role: 'user', content: text };
    appendMessage(session.id, userMsg);
    setRunning(true);

    // Compose system prompt: base + active person summary
    const activePerson = tree.activePersonId ? tree.state.persons[tree.activePersonId] : undefined;
    const systemContext: string = [
      BASE_RESEARCHER_SYSTEM,
      activePerson
        ? `\n\nACTIVE PERSON CONTEXT:\n${JSON.stringify(
            {
              id: activePerson.id,
              name: activePerson.name.full,
              sex: activePerson.sex,
              fsId: activePerson.fsId,
              facts: activePerson.facts.map((f) => ({
                type: f.type,
                date: f.date?.original,
                place: f.place?.original,
              })),
              parents: activePerson.parentIds.length,
              spouses: activePerson.spouseIds.length,
              children: activePerson.childIds.length,
            },
            null,
            2,
          )}`
        : '',
      isPromptTemplate
        ? '\n\nThe user has selected a structured prompt template. Follow its instructions precisely.'
        : '',
    ].filter(Boolean).join('');

    const initialMessages: ChatMessage[] = [
      { role: 'system', content: systemContext },
      ...session.messages,
      userMsg,
    ];

    try {
      const finalMessages = await runAgent(
        initialMessages,
        {
          ai,
          fs,
          getState: () => tree.state,
          setState: tree.setState,
          activePersonId: tree.activePersonId,
        },
        (step) => {
          // Persist each agent step (assistant + tool messages) to the session
          // so the user sees the agent's reasoning and tool calls live.
          appendMessage(session.id, step.message);
        },
      );
      // The final assistant message has already been appended via onStep.
      void finalMessages;
    } catch (err) {
      push('error', (err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || running) return;
    setInput('');
    void send(text);
  }

  function applyTemplate(promptText: string, label: string) {
    void send(`Apply this template:\n\n${promptText}\n\nUse the active person as the focus.`, true);
    push('info', `Running: ${label}`);
  }

  return (
    <div className="flex h-full flex-col bg-ink-900/30">
      <header className="flex items-center justify-between border-b border-ink-700/60 px-4 py-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-parchment-300" />
          <span className="font-serif text-sm text-parchment-100">Researcher</span>
          <select
            value={activeId ?? ''}
            onChange={(e) => setActive(e.target.value)}
            className="ml-2 rounded border border-ink-700 bg-ink-800 px-2 py-1 text-xs text-ink-200"
          >
            {Object.values(sessions).map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => newSession()} className="btn-ghost px-2 py-1 text-xs">
            <Plus className="h-3.5 w-3.5" /> New
          </button>
          {activeId && (
            <button
              onClick={() => deleteSession(activeId)}
              className="btn-ghost px-2 py-1 text-xs text-red-300 hover:text-red-200"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-wrap gap-1 border-b border-ink-700/60 bg-ink-900/30 px-3 py-2">
        {PROMPT_LIBRARY.map((p) => (
          <button
            key={p.id}
            onClick={() => applyTemplate(p.prompt, p.label)}
            disabled={running}
            className="chip hover:border-parchment-400/60 hover:text-parchment-100"
            title={p.description}
          >
            <Wand2 className="h-3 w-3" /> {p.label}
          </button>
        ))}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto scrollbar-thin px-4 py-3">
        {(!session || session.messages.length === 0) && (
          <div className="mx-auto max-w-md py-12 text-center text-ink-400">
            <Sparkles className="mx-auto mb-3 h-6 w-6 text-parchment-300/60" />
            <p className="font-serif text-lg text-parchment-100">Ask anything genealogical.</p>
            <p className="mt-1 text-sm">
              The researcher can read your tree, search FamilySearch, analyze
              sources, and propose next research steps. Try one of the templates
              above, or just type a question.
            </p>
          </div>
        )}
        <ul className="space-y-3">
          {session?.messages.map((m, i) => (
            <MessageBubble key={i} m={m} />
          ))}
          {running && (
            <li className="flex items-center gap-2 text-xs text-ink-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Researching…
            </li>
          )}
        </ul>
      </div>

      <form onSubmit={handleSubmit} className="border-t border-ink-700/60 bg-ink-900/40 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={2}
            placeholder="What would you like to research?"
            className="input min-h-[44px] resize-y"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <button type="submit" className="btn-primary" disabled={running || !input.trim()}>
            <Send className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-1 text-[11px] text-ink-400">
          ⌘/Ctrl+Enter to send. The agent will call tools (tree access, FamilySearch) as needed.
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ m }: { m: ChatMessage }) {
  if (m.role === 'system') return null;
  if (m.role === 'tool') {
    return (
      <li className="surface px-3 py-2 text-xs">
        <div className="mb-1 flex items-center gap-2 text-ink-300">
          <Hammer className="h-3.5 w-3.5" />
          <span className="font-mono">{m.toolName ?? 'tool'}</span>
        </div>
        <details>
          <summary className="cursor-pointer text-ink-400 hover:text-ink-200">
            Tool result
          </summary>
          <pre className="mt-1 overflow-auto rounded bg-ink-950/60 p-2 text-[11px] text-ink-200 scrollbar-thin">
            {truncate(m.content, 1200)}
          </pre>
        </details>
      </li>
    );
  }
  const isUser = m.role === 'user';
  return (
    <li
      className={cn(
        'flex',
        isUser ? 'justify-end' : 'justify-start',
      )}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-soft',
          isUser
            ? 'bg-parchment-400 text-ink-900'
            : 'bg-ink-800/70 text-ink-100 border border-ink-700/60',
        )}
      >
        {m.content && <pre className="whitespace-pre-wrap font-sans">{m.content}</pre>}
        {m.toolCalls?.map((tc) => (
          <div key={tc.id} className="mt-2 rounded border border-ink-700/60 bg-ink-900/40 p-2 text-xs">
            <div className="flex items-center gap-1 text-parchment-300">
              <Hammer className="h-3.5 w-3.5" /> calling <span className="font-mono">{tc.name}</span>
            </div>
            <pre className="mt-1 overflow-auto text-[11px] text-ink-300">
              {truncate(JSON.stringify(tc.input ?? {}, null, 2), 400)}
            </pre>
          </div>
        ))}
      </div>
    </li>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
