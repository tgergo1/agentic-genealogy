import { create } from 'zustand';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: string;
  kind: ToastKind;
  text: string;
}
interface ToastStore {
  items: ToastItem[];
  push: (kind: ToastKind, text: string) => void;
  dismiss: (id: string) => void;
}

export const useToasts = create<ToastStore>((set) => ({
  items: [],
  push(kind, text) {
    const id = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({ items: [...s.items, { id, kind, text }] }));
    setTimeout(() => {
      set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
    }, 5000);
  },
  dismiss(id) {
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
  },
}));

export function ToastViewport() {
  const { items, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto surface flex items-start gap-3 px-4 py-3 shadow-glow animate-slide-up',
            t.kind === 'success' && 'border-emerald-700/60',
            t.kind === 'error' && 'border-red-700/60',
          )}
        >
          {t.kind === 'success' && <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-400" />}
          {t.kind === 'error' && <AlertCircle className="mt-0.5 h-4 w-4 text-red-400" />}
          {t.kind === 'info' && <Info className="mt-0.5 h-4 w-4 text-parchment-300" />}
          <div className="flex-1 text-sm">{t.text}</div>
          <button onClick={() => dismiss(t.id)} className="text-ink-400 hover:text-ink-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
