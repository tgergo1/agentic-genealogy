import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { completeAuthFlow } from '../../lib/familysearch';
import { useSettings } from '../../stores/settings';

// Renders during the FamilySearch redirect: extracts code/state from the URL,
// exchanges them for tokens, then bounces back to the home view.

export function OAuthCallback() {
  const setFsTokens = useSettings((s) => s.setFsTokens);
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [message, setMessage] = useState<string>('Completing sign-in…');

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    if (error) {
      setStatus('error');
      setMessage(error);
      return;
    }
    if (!code || !state) {
      setStatus('error');
      setMessage('Missing code or state in callback URL.');
      return;
    }
    completeAuthFlow(code, state)
      .then(async (tokens) => {
        await setFsTokens(tokens);
        setStatus('success');
        setMessage('Signed in successfully. Redirecting…');
        setTimeout(() => {
          window.history.replaceState({}, '', '/');
          window.location.reload();
        }, 800);
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.message ?? String(err));
      });
  }, [setFsTokens]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="surface-strong max-w-md p-8 text-center">
        {status === 'pending' && (
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-parchment-300" />
        )}
        {status === 'success' && (
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
        )}
        {status === 'error' && (
          <AlertCircle className="mx-auto h-8 w-8 text-red-400" />
        )}
        <h1 className="mt-4 font-serif text-xl text-parchment-100">FamilySearch sign-in</h1>
        <p className="mt-2 text-sm text-ink-300">{message}</p>
        {status === 'error' && (
          <a href="/" className="btn-outline mt-4 inline-flex">
            Back home
          </a>
        )}
      </div>
    </div>
  );
}
