import { useEffect, useState } from 'react';
import { Toolbar } from './components/Toolbar';
import { TreeView } from './components/tree/TreeView';
import { PersonList } from './components/persons/PersonList';
import { PersonPanel } from './components/persons/PersonPanel';
import { ChatPanel } from './components/chat/ChatPanel';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { OAuthCallback } from './components/settings/OAuthCallback';
import { ToastViewport } from './components/ui/Toast';
import { useSettings } from './stores/settings';
import { useTree } from './stores/tree';
import { useChats } from './stores/chat';
import { useToasts } from './components/ui/Toast';

export default function App() {
  const settings = useSettings();
  const tree = useTree();
  const chats = useChats();
  const { push } = useToasts();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void Promise.all([settings.load(), tree.load(), chats.load()]).then(() =>
      setHydrated(true),
    );
  }, [settings, tree, chats]);

  // Open settings if there are no API keys yet — gentle nudge.
  useEffect(() => {
    if (!hydrated) return;
    if (!settings.ai.apiKey && !settings.fsConfig.clientId) {
      setSettingsOpen(true);
    }
  }, [hydrated, settings.ai.apiKey, settings.fsConfig.clientId]);

  // OAuth callback: when we land at /auth/familysearch/callback?code=... show
  // the dedicated callback view.
  if (
    typeof window !== 'undefined' &&
    window.location.pathname.startsWith('/auth/familysearch/callback')
  ) {
    return (
      <>
        <OAuthCallback />
        <ToastViewport />
      </>
    );
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-300">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <Toolbar onOpenSettings={() => setSettingsOpen(true)} />
      <main className="grid flex-1 overflow-hidden grid-cols-[260px_1fr_360px_420px]">
        <aside className="border-r border-ink-700/60 bg-ink-900/40">
          <PersonList />
        </aside>
        <section className="bg-ink-900/30">
          <TreeView />
        </section>
        <section className="border-l border-ink-700/60 bg-ink-900/40">
          <PersonPanel />
        </section>
        <section className="border-l border-ink-700/60">
          <ChatPanel />
        </section>
      </main>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ToastViewport />
      <ConnectionWatcher onError={(m) => push('error', m)} />
    </div>
  );
}

function ConnectionWatcher({ onError }: { onError: (m: string) => void }) {
  const { fsTokens } = useSettings();
  useEffect(() => {
    if (!fsTokens) return;
    if (Date.now() > fsTokens.expiresAt) {
      onError('FamilySearch token expired. Reconnect in Settings.');
    }
  }, [fsTokens, onError]);
  return null;
}
