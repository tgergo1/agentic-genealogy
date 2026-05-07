import { useState } from 'react';
import { ExternalLink, KeyRound, Plug, Unplug, Sparkles } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useSettings } from '../../stores/settings';
import { DEFAULT_MODELS, type AiProviderId } from '../../lib/ai';
import {
  startAuthFlow,
  clearStoredTokens,
  type FsEnvironment,
} from '../../lib/familysearch';
import { useToasts } from '../ui/Toast';

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useSettings();
  const { push } = useToasts();
  const [showAi, setShowAi] = useState(false);
  const [showFs, setShowFs] = useState(false);

  const fsConnected = Boolean(settings.fsTokens?.accessToken);
  const aiConfigured = Boolean(settings.ai.apiKey);

  async function handleConnectFs() {
    if (!settings.fsConfig.clientId) {
      push('error', 'Enter your FamilySearch app key (client ID) first.');
      return;
    }
    if (!settings.fsConfig.redirectUri) {
      push('error', 'Set a redirect URI matching the one registered with FamilySearch.');
      return;
    }
    const url = await startAuthFlow(settings.fsConfig);
    window.location.href = url;
  }

  async function handleDisconnectFs() {
    await clearStoredTokens();
    await settings.setFsTokens(undefined);
    push('info', 'Disconnected from FamilySearch.');
  }

  return (
    <Modal open={open} onClose={onClose} title="Settings" className="max-w-3xl">
      <div className="space-y-6">
        <Section
          icon={<Sparkles className="h-4 w-4" />}
          title="AI provider"
          subtitle={
            aiConfigured
              ? `Configured: ${settings.ai.provider} / ${settings.ai.model}`
              : 'Required to use the agentic researcher.'
          }
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div className="label mb-1">Provider</div>
              <select
                value={settings.ai.provider}
                onChange={(e) =>
                  settings.setAi({
                    provider: e.target.value as AiProviderId,
                    model: DEFAULT_MODELS[e.target.value as AiProviderId][0],
                  })
                }
                className="input"
              >
                <option value="anthropic">Anthropic Claude</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>
            <div>
              <div className="label mb-1">Model</div>
              <select
                value={settings.ai.model}
                onChange={(e) => settings.setAi({ model: e.target.value })}
                className="input"
              >
                {DEFAULT_MODELS[settings.ai.provider].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <div className="label mb-1">API key</div>
              <div className="flex gap-2">
                <input
                  type={showAi ? 'text' : 'password'}
                  value={settings.ai.apiKey}
                  onChange={(e) => settings.setAi({ apiKey: e.target.value })}
                  placeholder={
                    settings.ai.provider === 'anthropic'
                      ? 'sk-ant-...'
                      : 'sk-...'
                  }
                  className="input flex-1"
                />
                <button className="btn-outline" onClick={() => setShowAi((v) => !v)}>
                  {showAi ? 'Hide' : 'Show'}
                </button>
              </div>
              <div className="mt-2 text-xs text-ink-400">
                Stored locally in your browser (IndexedDB). Never sent anywhere
                except the provider you select.
              </div>
            </div>
            <div>
              <div className="label mb-1">Max tokens</div>
              <input
                type="number"
                value={settings.ai.maxTokens ?? 4096}
                onChange={(e) =>
                  settings.setAi({ maxTokens: parseInt(e.target.value, 10) || 4096 })
                }
                className="input"
              />
            </div>
            <div>
              <div className="label mb-1">Temperature</div>
              <input
                type="number"
                step="0.1"
                min={0}
                max={2}
                value={settings.ai.temperature ?? 0.4}
                onChange={(e) =>
                  settings.setAi({ temperature: parseFloat(e.target.value) || 0.4 })
                }
                className="input"
              />
            </div>
            <div className="md:col-span-2">
              <div className="label mb-1">Base URL (optional, for proxies)</div>
              <input
                value={settings.ai.baseUrl ?? ''}
                onChange={(e) => settings.setAi({ baseUrl: e.target.value || undefined })}
                placeholder={
                  settings.ai.provider === 'anthropic'
                    ? 'https://api.anthropic.com'
                    : 'https://api.openai.com'
                }
                className="input"
              />
            </div>
          </div>
        </Section>

        <Section
          icon={<KeyRound className="h-4 w-4" />}
          title="FamilySearch developer credentials"
          subtitle={
            <>
              Register your app at{' '}
              <a
                href="https://developers.familysearch.org/"
                target="_blank"
                rel="noreferrer"
                className="text-parchment-300 hover:underline inline-flex items-center gap-1"
              >
                developers.familysearch.org <ExternalLink className="h-3 w-3" />
              </a>
              . Add a redirect URI exactly matching the one below.
            </>
          }
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div className="label mb-1">Environment</div>
              <select
                value={settings.fsConfig.environment}
                onChange={(e) =>
                  settings.setFsConfig({
                    environment: e.target.value as FsEnvironment,
                  })
                }
                className="input"
              >
                <option value="production">Production (live data)</option>
                <option value="integration">Integration (sandbox)</option>
              </select>
            </div>
            <div>
              <div className="label mb-1">App key (client ID)</div>
              <div className="flex gap-2">
                <input
                  type={showFs ? 'text' : 'password'}
                  value={settings.fsConfig.clientId}
                  onChange={(e) => settings.setFsConfig({ clientId: e.target.value })}
                  className="input flex-1"
                  placeholder="a0T..."
                />
                <button className="btn-outline" onClick={() => setShowFs((v) => !v)}>
                  {showFs ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <div className="md:col-span-2">
              <div className="label mb-1">Redirect URI</div>
              <input
                value={settings.fsConfig.redirectUri}
                onChange={(e) => settings.setFsConfig({ redirectUri: e.target.value })}
                className="input"
              />
              <div className="mt-2 text-xs text-ink-400">
                Must match the redirect URI registered with FamilySearch exactly.
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            {fsConnected ? (
              <button onClick={handleDisconnectFs} className="btn-outline">
                <Unplug className="h-4 w-4" /> Disconnect
              </button>
            ) : (
              <button onClick={handleConnectFs} className="btn-primary">
                <Plug className="h-4 w-4" /> Connect FamilySearch
              </button>
            )}
            <span className="text-xs text-ink-400">
              {fsConnected
                ? `Token expires in ${Math.max(
                    0,
                    Math.round(((settings.fsTokens?.expiresAt ?? 0) - Date.now()) / 60000),
                  )} min`
                : 'You will be redirected to sign in to FamilySearch.'}
            </span>
          </div>
        </Section>
      </div>
    </Modal>
  );
}

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="surface p-5">
      <header className="mb-3 flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-parchment-400/10 text-parchment-300">
          {icon}
        </div>
        <div>
          <div className="font-serif text-lg text-parchment-100">{title}</div>
          <div className="mt-0.5 text-xs text-ink-300">{subtitle}</div>
        </div>
      </header>
      {children}
    </section>
  );
}
