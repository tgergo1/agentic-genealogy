import { create } from 'zustand';
import { readKey, writeKey, StorageKeys } from '../lib/storage';
import type { ChatMessage } from '../lib/ai';

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMessage[];
}

interface ChatsStore {
  sessions: Record<string, ChatSession>;
  activeId?: string;
  loaded: boolean;
  load: () => Promise<void>;
  newSession: (title?: string) => string;
  setActive: (id: string) => void;
  appendMessage: (id: string, msg: ChatMessage) => void;
  deleteSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
}

export const useChats = create<ChatsStore>((set, get) => ({
  sessions: {},
  loaded: false,
  async load() {
    const stored = await readKey<{
      sessions: Record<string, ChatSession>;
      activeId?: string;
    }>(StorageKeys.Chats);
    set({
      sessions: stored?.sessions ?? {},
      activeId: stored?.activeId,
      loaded: true,
    });
  },
  newSession(title) {
    const id = `c_${Date.now().toString(36)}`;
    const session: ChatSession = {
      id,
      title: title ?? 'New research session',
      createdAt: Date.now(),
      messages: [],
    };
    set((s) => ({
      sessions: { ...s.sessions, [id]: session },
      activeId: id,
    }));
    void persist(get());
    return id;
  },
  setActive(id) {
    set({ activeId: id });
    void persist(get());
  },
  appendMessage(id, msg) {
    set((s) => {
      const session = s.sessions[id];
      if (!session) return s;
      return {
        sessions: {
          ...s.sessions,
          [id]: { ...session, messages: [...session.messages, msg] },
        },
      };
    });
    void persist(get());
  },
  deleteSession(id) {
    set((s) => {
      const next = { ...s.sessions };
      delete next[id];
      return {
        sessions: next,
        activeId: s.activeId === id ? undefined : s.activeId,
      };
    });
    void persist(get());
  },
  renameSession(id, title) {
    set((s) => {
      const session = s.sessions[id];
      if (!session) return s;
      return { sessions: { ...s.sessions, [id]: { ...session, title } } };
    });
    void persist(get());
  },
}));

async function persist(s: ChatsStore) {
  await writeKey(StorageKeys.Chats, {
    sessions: s.sessions,
    activeId: s.activeId,
  });
}
