import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { z } from 'zod';
import { api, errorMessage } from '../../shared/api';
import { Button, ErrorNotice, Field } from '../../shared/ui';
import type { CurrentUser } from '../../shared/types';
import { useAuth } from './AuthProvider';

const registerSchema = z.object({
  displayName: z.string().trim().min(1, 'Enter your name.').max(80),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Use at least 3 characters.')
    .max(30)
    .regex(/^[a-z0-9._-]+$/, 'Use letters, numbers, dots, underscores, or hyphens.'),
  email: z.email('Enter a valid email address.').max(254),
  password: z.string().min(8, 'Use at least 8 characters.').max(128),
});

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState({
    displayName: '',
    username: '',
    email: '',
    identifier: '',
    password: '',
  });
  const update = (key: keyof typeof fields, value: string) =>
    setFields((current) => ({ ...current, [key]: value }));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const input = mode === 'register' ? registerSchema.safeParse(fields) : null;
    if (input && !input.success) {
      setError(input.error.issues[0]?.message || 'Check your details.');
      return;
    }
    setBusy(true);
    try {
      const body =
        mode === 'register'
          ? input?.data
          : { identifier: fields.identifier.trim().toLowerCase(), password: fields.password };
      const { data } = await api.post<{ user: CurrentUser }>(
        `/api/v1/auth/${mode === 'register' ? 'register' : 'login'}`,
        body,
      );
      setUser(data.user);
      navigate('/app/chats', { replace: true });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="w-full max-w-[440px]">
      <span className="inline-flex items-center gap-2 rounded-full bg-mist px-3 py-1.5 text-xs font-bold text-sea">
        <span className="size-1.5 rounded-full bg-coral" />{' '}
        {mode === 'login' ? 'Welcome back' : 'Your story starts here'}
      </span>
      <h1 className="mt-5 font-display text-[clamp(2.6rem,5vw,3.8rem)] leading-[1.05] font-semibold tracking-[-0.055em]">
        {mode === 'login' ? (
          <>
            Good to have
            <br />
            you back<span className="text-coral">.</span>
          </>
        ) : (
          <>
            Make yourself
            <br />
            at home<span className="text-coral">.</span>
          </>
        )}
      </h1>
      <p className="mt-4 max-w-sm text-[15px] leading-7 text-muted">
        {mode === 'login'
          ? 'Your conversations are right where you left them.'
          : 'A little closer to the people who make your day.'}
      </p>
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
        noValidate
        className="mt-9 grid gap-4"
      >
        {mode === 'register' && (
          <>
            <Field
              id="displayName"
              label="Your name"
              autoComplete="name"
              value={fields.displayName}
              onChange={(event) => update('displayName', event.target.value)}
              required
              maxLength={80}
            />
            <Field
              id="username"
              label="Username"
              autoComplete="username"
              value={fields.username}
              onChange={(event) => update('username', event.target.value)}
              required
              maxLength={30}
            />
            <Field
              id="email"
              label="Email address"
              type="email"
              autoComplete="email"
              value={fields.email}
              onChange={(event) => update('email', event.target.value)}
              required
            />
          </>
        )}
        {mode === 'login' && (
          <Field
            id="identifier"
            label="Username or email"
            autoComplete="username"
            value={fields.identifier}
            onChange={(event) => update('identifier', event.target.value)}
            required
          />
        )}
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={fields.password}
          onChange={(event) => update('password', event.target.value)}
          required
        />
        {error && <ErrorNotice message={error} />}
        <Button primary disabled={busy} className="mt-2 w-full py-3.5">
          {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}{' '}
          {!busy && <ArrowRight size={18} />}
        </Button>
      </form>
      <p className="mt-7 text-center text-sm text-muted">
        {mode === 'login' ? 'New around here?' : 'Already have an account?'}{' '}
        <Link
          to={mode === 'login' ? '/register' : '/login'}
          className="font-bold text-sea underline decoration-coral decoration-2 underline-offset-4"
        >
          {mode === 'login' ? 'Create an account' : 'Log in'}
        </Link>
      </p>
    </div>
  );
}
