import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/utils';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { tooltip?: string };

export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { className, tooltip, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      title={tooltip}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-300 hover:bg-ink-700/50 hover:text-ink-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-parchment-400',
        className,
      )}
      {...rest}
    />
  );
});
