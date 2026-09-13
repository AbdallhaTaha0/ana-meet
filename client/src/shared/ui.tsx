import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react';
import { X } from 'lucide-react';

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition duration-200 hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50';
const inputBase =
  'w-full rounded-xl border border-line bg-white px-4 py-3 text-[15px] text-ink shadow-[0_2px_8px_#192e3706] placeholder:text-muted focus:border-sea focus:outline-none focus:ring-3 focus:ring-sea/10';

export function Button({
  primary,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button
      className={`${buttonBase} ${primary ? 'border-sea bg-sea text-white shadow-[0_8px_18px_#087f7025] hover:bg-sea-dark' : 'border-line bg-white text-ink hover:bg-mist'} ${className}`}
      {...props}
    />
  );
}

export function IconButton({
  label,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`grid size-10 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-mist hover:text-sea ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  id,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string }) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <input id={id} className={`${inputBase} ${className}`} {...props} />
    </div>
  );
}

export function TextField({
  label,
  id,
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; id: string }) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <textarea id={id} className={`${inputBase} ${className}`} {...props} />
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-3 flex items-center gap-2 text-xs font-extrabold tracking-[0.16em] text-sea uppercase">
          <span className="size-1.5 rounded-full bg-coral" />
          {eyebrow}
        </p>
        <h1 className="font-display text-4xl font-semibold tracking-tight md:text-5xl">
          {title}
          <span className="text-coral">.</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">{description}</p>
      </div>
      {action}
    </header>
  );
}

export function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-2xl bg-mist font-display font-bold text-sea ring-1 ring-sea/10 ${small ? 'size-9 text-xs' : 'size-11 text-sm'}`}
    >
      {letters}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid justify-items-center gap-3 px-6 py-16 text-center">
      <span
        aria-hidden="true"
        className="grid size-14 place-items-center rounded-[20px] bg-mist text-2xl text-sea"
      >
        ✳
      </span>
      <strong className="font-display text-lg font-semibold">{title}</strong>
      <p className="max-w-sm text-sm leading-6 text-muted">{description}</p>
      {action}
    </div>
  );
}

export function ErrorNotice({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div
      role="alert"
      className="my-3 flex items-center justify-between gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-danger"
    >
      <span>{message}</span>
      {onDismiss && (
        <IconButton label="Dismiss error" onClick={onDismiss}>
          <X size={16} />
        </IconButton>
      )}
    </div>
  );
}

export function ContentPage({ children, className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <div
      className={`h-full overflow-y-auto bg-paper px-5 py-8 text-ink md:px-10 md:py-12 xl:px-16 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
