import { useEffect, useRef, type ReactNode } from 'react';

export function Modal({
  labelledBy,
  onClose,
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="m-auto max-h-[90dvh] w-[min(520px,calc(100%-40px))] overflow-y-auto rounded-2xl border-0 bg-white p-6 text-ink shadow-2xl backdrop:bg-ink/65"
      aria-labelledby={labelledBy}
      onCancel={onClose}
    >
      {children}
    </dialog>
  );
}
