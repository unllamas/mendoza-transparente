import { Avatar } from "@mt/ui/components/base/avatar/avatar";
import { cx } from "@mt/ui/lib/cx";

/** The party, front or bloc a badge shows: its logo or, until there is one, its official color. */
export interface AvatarParty {
  name: string;
  logo: string | null;
  color?: string | null;
}

/**
 * Face of a person (BoardUI `Avatar`): their official photo, or their initials until there is one or if it fails.
 * Every mention of a person uses it, so people can be recognized at a glance. Size it with `className` ("size-10 text-xs").
 *
 * `party` adds a small badge at the bottom right with the party, front or bloc the official source gives; `partyMissing`, an
 * empty dashed one for elected people whose source does not say it. Appointed positions get neither (docs/procesos/diseno.md).
 * Only from 40 px up: smaller, the badge cannot be read. It is decorative: the party name is always written in the row.
 */
export function PersonAvatar({
  name,
  photo,
  className,
  party,
  partyMissing,
}: {
  name: string;
  photo: string | null | undefined;
  className?: string;
  party?: AvatarParty | null;
  partyMissing?: boolean;
}) {
  const face = <Avatar src={photo ?? undefined} initials={initials(name)} aria-hidden className={cx("font-medium", className)} />;
  if (!party && !partyMissing) return face;
  return (
    <span aria-hidden className="relative inline-flex shrink-0">
      {face}
      <PartyBadge party={party ?? null} />
    </span>
  );
}

function PartyBadge({ party }: { party: AvatarParty | null }) {
  return party ? (
    <PartyAvatar party={party} className="absolute -right-0.5 -bottom-0.5 size-[45%] min-h-4 min-w-4 ring-2 ring-background-surface" />
  ) : (
    <span className="absolute -right-0.5 -bottom-0.5 size-[45%] min-h-4 min-w-4 rounded-full border border-dashed border-text-tertiary bg-background-surface ring-2 ring-background-surface" />
  );
}

/**
 * Mark of a party, front or bloc, so it can be told apart at a glance: its official logo; without one, a disc of its
 * official color (data/curado/partidos.yaml or colores-partidos.yaml); and a neutral disc only when there is neither.
 * Never letters: two loose letters say nothing, and the name is always written next to it. Size it with `className`.
 */
export function PartyAvatar({ party, className }: { party: AvatarParty; className?: string }) {
  const color = !party.logo && party.color ? party.color : null;
  return (
    <span
      aria-hidden
      style={color ? { backgroundColor: color } : undefined}
      className={cx(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        party.logo ? "border border-separator-border bg-white" : !color && "bg-background-secondary-default",
        className,
      )}
    >
      {party.logo && <img src={party.logo} alt="" loading="lazy" decoding="async" className="size-full object-contain" />}
    </span>
  );
}

/** "María de los Ángeles Pérez" → "MÁ": first letters of the first two words that are not connectors. */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w) && !/^(de|del|la|las|los|y)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
