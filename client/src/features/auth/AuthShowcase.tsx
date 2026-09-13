import { Heart, MessageCircleHeart, Sparkles } from 'lucide-react';
import { ConversationPreview } from '../marketing/ConversationPreview';

export function AuthShowcase() {
  return (
    <aside className="relative hidden min-h-dvh flex-col overflow-hidden bg-ink px-10 py-7 text-white lg:flex xl:px-16">
      <div className="absolute -right-44 -top-40 size-[520px] rounded-full bg-sea/50 blur-3xl" />
      <div className="absolute -bottom-48 -left-32 size-[460px] rounded-full bg-coral/30 blur-3xl" />
      <div className="relative z-10 flex items-center gap-3 font-display text-2xl font-bold tracking-tight">
        <span className="grid size-10 place-items-center rounded-2xl bg-coral text-ink">
          <MessageCircleHeart size={23} />
        </span>
        ana<span className="-ml-3 text-[#93d5c4]">meet</span>
        <span className="-ml-3 text-coral">.</span>
      </div>
      <div className="relative z-10 my-auto">
        <div className="mx-auto h-[540px] max-w-[390px]">
          <div className="origin-top scale-[0.8]">
            <ConversationPreview />
          </div>
        </div>
        <div className="mx-auto max-w-[390px]">
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-[#9ce4d1] uppercase">
            <Sparkles size={15} /> Better together
          </p>
          <h2 className="mt-2 font-display text-4xl font-semibold leading-tight tracking-tight">
            The people make
            <br />
            the place.
          </h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-white/65">
            Every message, shared story, and little check-in brings your world a bit closer.
          </p>
        </div>
      </div>
      <p className="relative z-10 flex items-center gap-2 text-xs text-white/55">
        <Heart size={14} className="text-coral" /> A calmer space to connect.
      </p>
    </aside>
  );
}
