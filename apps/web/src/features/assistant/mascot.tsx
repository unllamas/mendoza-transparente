import { useId } from "react";

/** Aco, an Andean condor: black shoulders with white wing bars, the white ruff, bare head with its crest. Flat colors. */
export function Mascot({ className, background = true }: { className?: string; background?: boolean }) {
  const clipId = useId();
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      {background && <circle cx="50" cy="50" r="50" fill="var(--color-accent-100)" />}
      <g clipPath={background ? `url(#${clipId})` : undefined}>
        <defs>
          <clipPath id={clipId}>
            <circle cx="50" cy="50" r="50" />
          </clipPath>
        </defs>
        {/* shoulders and wing bars */}
        <ellipse cx="50" cy="104" rx="42" ry="30" fill="#22262d" />
        <path d="M14 92c8-8 16-11 24-11" stroke="#e8ebef" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M86 92c-8-8-16-11-24-11" stroke="#e8ebef" strokeWidth="4" strokeLinecap="round" fill="none" />
        {/* white ruff */}
        {[28, 36, 44, 52, 60, 68, 72].map((x, i) => (
          <circle key={x} cx={x} cy={i % 2 ? 76 : 74} r="7" fill="#ffffff" />
        ))}
        {/* bare head */}
        <ellipse cx="50" cy="46" rx="21" ry="23" fill="#9b6e64" />
        <ellipse cx="50" cy="50" rx="15" ry="15" fill="#b98a7d" />
        {/* crest */}
        <path d="M42 26c0-8 16-8 16 0 0 6-3 13-8 16-5-3-8-10-8-16z" fill="#6f4643" />
        {/* eyes */}
        <circle cx="41" cy="43" r="6" fill="#ffffff" />
        <circle cx="42" cy="44" r="3.6" fill="#16191d" />
        <circle cx="43.2" cy="42.6" r="1.2" fill="#ffffff" />
        <circle cx="59" cy="43" r="6" fill="#ffffff" />
        <circle cx="60" cy="44" r="3.6" fill="#16191d" />
        <circle cx="61.2" cy="42.6" r="1.2" fill="#ffffff" />
        {/* hooked beak */}
        <path d="M44 51c2-2 10-2 12 0 1 4 0 9-3 12-1 1-2 1-2-1l-1-3c-3-1-6-4-6-8z" fill="#f1e7cf" />
        <path d="M51 59c1 2 2 4 2 5 0 1-2 1-2-1z" fill="#c9b48c" />
      </g>
    </svg>
  );
}

/** Flat Andes on a pale sky: the Aconcagua with snow in the middle, a lighter range in front. */
export function Andes() {
  return (
    <svg viewBox="0 0 400 120" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-24 w-full" aria-hidden>
      <path d="M0 80 60 46l40 24 50-38 46 30 38-22 52 36 40-26 74 40v30H0z" fill="var(--color-accent-100)" />
      <path d="M0 98 70 64l44 22 60-54 34 26 30-14 56 40 50-22 56 34v24H0z" fill="var(--color-accent-200)" />
      <path d="M174 32 160 45l8-2 6 6 6-7 9 3z" fill="#ffffff" />
    </svg>
  );
}
