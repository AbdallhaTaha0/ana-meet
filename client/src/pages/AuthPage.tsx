import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AuthForm } from '../features/auth/AuthForm';
import { AuthShowcase } from '../features/auth/AuthShowcase';
import { Brand } from '../shared/Brand';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  return (
    <div className="min-h-dvh bg-paper text-ink lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(450px,.95fr)]">
      <AuthShowcase />
      <div className="flex min-h-dvh flex-col px-5 py-6 sm:px-10 lg:px-12 lg:py-9 xl:px-20">
        <header className="flex items-center justify-between">
          <span className="lg:hidden">
            <Brand />
          </span>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-bold text-muted hover:text-sea"
          >
            <ArrowLeft size={16} /> Back to home
          </Link>
        </header>
        <main className="mx-auto flex w-full flex-1 items-center justify-center py-12">
          <AuthForm mode={mode} />
        </main>
        <footer className="text-center text-xs text-muted">
          A little closer, every day. © {new Date().getFullYear()} ANA Meet.
        </footer>
      </div>
    </div>
  );
}
