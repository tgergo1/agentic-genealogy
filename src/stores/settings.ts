import { create } from 'zustand';
import { readKey, writeKey, StorageKeys } from '../lib/storage';
import type { AiSettings } from '../lib/ai';
import type { FsConfig, FsTokens } from '../lib/familysearch';

export interface WikiTreeSettings {
  enabled: boolean;
  // Optional: a WikiTree ID (e.g. "Smith-1") to use as the user's "home"
  // person for actions like "Pull my ancestry".
  homeId?: string;
}

export interface AppSettings {
  ai: AiSettings;
  fsConfig: FsConfig;
  fsTokens?: FsTokens;
  wikitree: WikiTreeSettings;
  // UI
  theme: 'dark' | 'light';
}

const DEFAULTS: AppSettings = {
  ai: {
    provider: 'anthropic',
    apiKey: '',
    model: 'claude-sonnet-4-6',
    maxTokens: 4096,
    temperature: 0.4,
  },
  fsConfig: {
    clientId: '',
    redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/auth/familysearch/callback` : '',
    environment: 'production',
  },
  wikitree: {
    enabled: true,
    homeId: '',
  },
  theme: 'dark',
};

interface SettingsStore extends AppSettings {
  loaded: boolean;
  load: () => Promise<void>;
  setAi: (patch: Partial<AiSettings>) => Promise<void>;
  setFsConfig: (patch: Partial<FsConfig>) => Promise<void>;
  setFsTokens: (tokens: FsTokens | undefined) => Promise<void>;
  setWikitree: (patch: Partial<WikiTreeSettings>) => Promise<void>;
  setTheme: (theme: 'dark' | 'light') => Promise<void>;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...DEFAULTS,
  loaded: false,
  async load() {
    const stored = await readKey<AppSettings>(StorageKeys.Settings);
    const tokens = await readKey<FsTokens>(StorageKeys.FsTokens);
    set({
      ...DEFAULTS,
      ...(stored ?? {}),
      fsTokens: tokens,
      loaded: true,
    });
  },
  async setAi(patch) {
    const next = { ...get(), ai: { ...get().ai, ...patch } };
    set({ ai: next.ai });
    await persist(get());
  },
  async setFsConfig(patch) {
    const next = { ...get(), fsConfig: { ...get().fsConfig, ...patch } };
    set({ fsConfig: next.fsConfig });
    await persist(get());
  },
  async setFsTokens(tokens) {
    set({ fsTokens: tokens });
    if (tokens) await writeKey(StorageKeys.FsTokens, tokens);
  },
  async setWikitree(patch) {
    set({ wikitree: { ...get().wikitree, ...patch } });
    await persist(get());
  },
  async setTheme(theme) {
    set({ theme });
    await persist(get());
  },
}));

async function persist(s: SettingsStore) {
  const toStore: AppSettings = {
    ai: s.ai,
    fsConfig: s.fsConfig,
    fsTokens: s.fsTokens,
    wikitree: s.wikitree,
    theme: s.theme,
  };
  await writeKey(StorageKeys.Settings, toStore);
}
