import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/80 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className={cn(
          'surface-strong w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col animate-slide-up',
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3">
          <div className="font-serif text-lg text-parchment-100">{title}</div>
          <button onClick={onClose} className="btn-ghost px-2 py-1">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-auto scrollbar-thin p-5">{children}</div>
      </div>
    </div>
  );
}
