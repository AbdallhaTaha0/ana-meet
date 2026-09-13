import { CheckCheck, Heart, MoreHorizontal, Phone, Send, Smile } from 'lucide-react';

const members = [
  { letter: 'M', tone: 'bg-[#edbc94]', offset: '-ml-0' },
  { letter: 'O', tone: 'bg-[#c4c5ee]', offset: '-ml-2' },
  { letter: 'Y', tone: 'bg-[#a7d9c4]', offset: '-ml-2' },
];

export function ConversationPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[510px] py-8" aria-hidden="true">
      <div className="absolute -left-7 top-2 size-28 rounded-full bg-coral/35 blur-2xl" />
      <div className="absolute -right-7 bottom-8 size-36 rounded-full bg-sea/25 blur-3xl" />
      <div className="relative overflow-hidden rounded-[30px] border border-white/80 bg-white text-ink shadow-[0_30px_90px_#18332e25]">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <div className="grid size-11 place-items-center rounded-2xl bg-[#e4ddf8] text-xl">✳</div>
          <div className="min-w-0 flex-1">
            <strong className="block font-display text-[15px]">Weekend people</strong>
            <span className="text-xs text-muted">4 members · 2 online</span>
          </div>
          <Phone size={18} className="text-muted" />
          <MoreHorizontal size={20} className="ml-2 text-muted" />
        </div>
        <div className="space-y-5 bg-[radial-gradient(#d8e4dd_0.7px,transparent_0.7px)] bg-size-[16px_16px] px-5 py-7 sm:px-8">
          <p className="mx-auto w-fit rounded-full bg-white px-3 py-1 text-[10px] font-bold tracking-widest text-muted uppercase shadow-sm">
            Today
          </p>
          <div className="flex items-end gap-2">
            <span className="grid size-8 place-items-center rounded-full bg-[#edbc94] text-xs font-bold">
              M
            </span>
            <div className="max-w-[77%] rounded-[18px] rounded-bl-md bg-white px-4 py-3 shadow-sm">
              <span className="text-[11px] font-bold text-[#a36037]">Maya</span>
              <p className="mt-0.5 text-[13px] leading-5">Are we still on for Saturday? ☀️</p>
              <span className="mt-1 block text-right text-[10px] text-muted">10:42</span>
            </div>
          </div>
          <div className="flex items-end gap-2">
            <span className="grid size-8 place-items-center rounded-full bg-[#c4c5ee] text-xs font-bold">
              O
            </span>
            <div className="max-w-[77%] rounded-[18px] rounded-bl-md bg-white px-4 py-3 shadow-sm">
              <span className="text-[11px] font-bold text-[#7468ae]">Omar</span>
              <p className="mt-0.5 text-[13px] leading-5">Yes! I’ll bring the good coffee.</p>
              <span className="mt-1 block text-right text-[10px] text-muted">10:43</span>
            </div>
          </div>
          <div className="ml-auto max-w-[75%] rounded-[18px] rounded-br-md bg-sea px-4 py-3 text-white shadow-sm">
            <p className="text-[13px] leading-5">Perfect. See you all there! ✨</p>
            <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-white/75">
              10:44 <CheckCheck size={12} />
            </span>
          </div>
          <div className="flex items-center gap-1.5 pl-11 text-[11px] text-muted">
            <span className="size-1.5 animate-pulse rounded-full bg-sea" /> Yasmin is typing...
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-line bg-white px-5 py-4">
          <Smile size={19} className="text-muted" />
          <span className="flex-1 rounded-full bg-paper px-4 py-2.5 text-xs text-muted">
            Write a message...
          </span>
          <span className="grid size-9 place-items-center rounded-full bg-sea text-white">
            <Send size={15} />
          </span>
        </div>
      </div>
      <div className="absolute -right-4 top-1 hidden items-center gap-2 rounded-2xl bg-white px-3 py-2.5 text-ink shadow-xl sm:flex">
        <span className="grid size-8 place-items-center rounded-full bg-[#ffe5db] text-coral">
          <Heart size={15} fill="currentColor" />
        </span>
        <span className="text-xs font-bold">Moments together</span>
      </div>
      <div className="absolute -bottom-1 -left-5 hidden items-center rounded-2xl bg-white px-4 py-3 text-ink shadow-xl sm:flex">
        <div className="flex">
          {members.map((member) => (
            <span
              key={member.letter}
              className={`grid size-8 place-items-center rounded-full border-2 border-white text-[11px] font-bold ${member.tone} ${member.offset}`}
            >
              {member.letter}
            </span>
          ))}
        </div>
        <span className="ml-2 text-xs font-bold">Your circle is here</span>
      </div>
    </div>
  );
}
