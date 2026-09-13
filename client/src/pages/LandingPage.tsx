import { ArrowRight, Heart, LockKeyhole, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ConversationPreview } from '../features/marketing/ConversationPreview';
import { Brand } from '../shared/Brand';

const highlights = [
  {
    icon: Heart,
    title: 'Closer conversations',
    copy: 'Make space for the chats that matter most.',
  },
  { icon: Sparkles, title: 'Little moments', copy: 'Share a story before the day slips by.' },
  { icon: LockKeyhole, title: 'Your own space', copy: 'A calm home for your people and groups.' },
];

export function LandingPage() {
  return (
    <div className="min-h-dvh overflow-hidden bg-paper text-ink">
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-8 lg:py-8">
        <Brand />
        <nav aria-label="Welcome" className="flex items-center gap-4 sm:gap-7">
          <Link to="/login" className="text-sm font-bold text-ink hover:text-sea">
            Log in
          </Link>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-ink/10 transition hover:-translate-y-0.5 hover:bg-sea sm:px-5"
          >
            Get started <ArrowRight size={16} />
          </Link>
        </nav>
      </header>
      <main>
        <section className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 pb-20 pt-10 sm:px-8 lg:min-h-[710px] lg:grid-cols-[1fr_1.05fr] lg:gap-12 lg:pb-28 lg:pt-16">
          <div className="pointer-events-none absolute -left-40 top-24 size-96 rounded-full bg-[#fce6d9] opacity-70 blur-3xl" />
          <div className="relative z-10 max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-sea/15 bg-mist px-3 py-1.5 text-xs font-bold text-sea">
              <span className="size-2 rounded-full bg-coral" /> A little closer, every day
            </div>
            <h1 className="mt-7 font-display text-[clamp(3.4rem,7vw,6.6rem)] leading-[0.98] font-semibold tracking-[-0.065em]">
              Your people.
              <br />
              <span className="text-sea">Your place.</span>
              <span className="text-coral"> ✳</span>
            </h1>
            <p className="mt-7 max-w-md text-[17px] leading-8 text-muted">
              The good stuff happens in conversation. Bring your chats, stories, and favorite people
              together in one lovely little space.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                to="/register"
                className="inline-flex min-h-13 items-center gap-3 rounded-full bg-sea px-6 py-3 text-sm font-bold text-white shadow-[0_12px_26px_#087f7030] transition hover:-translate-y-0.5 hover:bg-sea-dark"
              >
                Find your people <ArrowRight size={18} />
              </Link>
              <Link
                to="/login"
                className="text-sm font-bold text-ink underline decoration-coral decoration-2 underline-offset-4 hover:text-sea"
              >
                I already have an account
              </Link>
            </div>
            <div className="mt-12 flex items-center gap-3 border-t border-line pt-5">
              <div className="flex -space-x-2">
                <span className="grid size-8 place-items-center rounded-full border-2 border-paper bg-[#edbc94] text-xs font-bold">
                  M
                </span>
                <span className="grid size-8 place-items-center rounded-full border-2 border-paper bg-[#c4c5ee] text-xs font-bold">
                  O
                </span>
                <span className="grid size-8 place-items-center rounded-full border-2 border-paper bg-[#a7d9c4] text-xs font-bold">
                  Y
                </span>
              </div>
              <span className="text-xs font-medium text-muted">
                A better way to stay in the loop
              </span>
            </div>
          </div>
          <div className="relative z-10 rounded-[44px] bg-[radial-gradient(circle_at_30%_20%,#d9f0de,transparent_43%),radial-gradient(circle_at_80%_80%,#fde2d8,transparent_45%),#eff3ed] px-5 py-7 sm:px-10 lg:px-8">
            <ConversationPreview />
          </div>
        </section>
        <section className="border-y border-line bg-white px-5 py-16 sm:px-8">
          <div className="mx-auto max-w-7xl">
            <p className="text-xs font-bold tracking-[0.2em] text-sea uppercase">
              Made for real connection
            </p>
            <h2 className="mt-3 max-w-2xl font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              More than messages.
              <br />A place to belong.
            </h2>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {highlights.map(({ icon: Icon, title, copy }) => (
                <article key={title} className="rounded-[26px] border border-line bg-paper p-6">
                  <span className="grid size-11 place-items-center rounded-2xl bg-mist text-sea">
                    <Icon size={21} />
                  </span>
                  <h3 className="mt-6 font-display text-xl font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-xs text-muted sm:px-8">
        <Brand />
        <span>
          Made for the moments that make us closer. © {new Date().getFullYear()} ANA Meet.
        </span>
      </footer>
    </div>
  );
}
