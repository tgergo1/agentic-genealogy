import { get, set, del } from 'idb-keyval';

// IndexedDB-backed storage for trees, settings, and chat history.
// Anything that should persist between sessions should go through here.

export const StorageKeys = {
  Settings: 'agen.settings.v1',
  Tree: 'agen.tree.v1',
  Chats: 'agen.chats.v1',
  FsTokens: 'agen.fs.tokens.v1',
  FsPkce: 'agen.fs.pkce.v1',
} as const;

export type StorageKey = (typeof StorageKeys)[keyof typeof StorageKeys];

export async function readKey<T>(key: StorageKey): Promise<T | undefined> {
  return (await get<T>(key)) ?? undefined;
}

export async function writeKey<T>(key: StorageKey, value: T): Promise<void> {
  await set(key, value);
}

export async function deleteKey(key: StorageKey): Promise<void> {
  await del(key);
}
