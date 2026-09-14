import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './ui';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive actions get the danger treatment; everything else uses brand. */
  danger?: boolean;
}

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(() =>
  Promise.resolve(false),
);

export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    // A new request supersedes a stale open dialog instead of stacking.
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setPending(options);
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setPending(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <Modal labelledBy="confirm-title" onClose={() => settle(false)}>
          <div className="flex items-start gap-4">
            <span
              aria-hidden="true"
              className={`grid size-12 shrink-0 place-items-center rounded-2xl ${
                pending.danger ? 'bg-danger/10 text-danger' : 'bg-mist text-sea'
              }`}
            >
              {pending.danger ? <AlertTriangle size={22} /> : <Info size={22} />}
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="confirm-title" className="font-display text-xl font-semibold tracking-tight">
                {pending.title}
              </h2>
              {pending.description && (
                <p className="mt-2 text-sm leading-6 text-muted">{pending.description}</p>
              )}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Button autoFocus onClick={() => settle(false)}>
              {pending.cancelLabel || 'Cancel'}
            </Button>
            <Button
              primary={!pending.danger}
              className={
                pending.danger ? 'border-danger bg-danger text-white hover:bg-danger/90' : ''
              }
              onClick={() => settle(true)}
            >
              {pending.confirmLabel || 'Confirm'}
            </Button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}
