import { MessageCircleHeart } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Brand({
  compact = false,
  inverse = false,
}: {
  compact?: boolean;
  inverse?: boolean;
}) {
  return (
    <Link
      to="/"
      aria-label="ANA Meet home"
      className={`inline-flex items-center gap-2.5 font-display font-bold tracking-[-0.045em] ${inverse ? 'text-white' : 'text-ink'}`}
    >
      <span className="grid size-9 place-items-center rounded-[13px] bg-coral text-ink shadow-[0_5px_0_#192e3720]">
        <MessageCircleHeart size={20} strokeWidth={2.4} />
      </span>
      {!compact && (
        <span className="text-[23px] leading-none">
          ana<span className="text-sea">meet</span>
          <span className="text-coral">.</span>
        </span>
      )}
    </Link>
  );
}
