import { Avatar } from "@mt/ui/components/base/avatar/avatar";
import { cx } from "@mt/ui/lib/cx";

/** The party, front or bloc a badge shows: its logo or, until there is one, its acronym or initials on its color. */
export interface AvatarParty {
  name: string;
  short: string;
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
 * Mark of a party, front or bloc, so it can be told apart at a glance: its official logo; without one, its acronym or
 * initials on the party's own color; and on a neutral disc only for the names nobody curated (data/curado/partidos.yaml).
 * Size it with `className` ("size-10"); the letters follow the size.
 */
export function PartyAvatar({ party, className }: { party: AvatarParty; className?: string }) {
  const color = !party.logo && party.color ? party.color : null;
  return (
    <span
      aria-hidden
      style={color ? { backgroundColor: color } : undefined}
      className={cx(
        "@container flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        party.logo
          ? "border border-separator-border bg-white"
          : color
            ? isLight(color)
              ? "text-black"
              : "text-white"
            : "bg-background-secondary-default text-text-secondary",
        className,
      )}
    >
      {party.logo ? (
        <img src={party.logo} alt="" loading="lazy" decoding="async" className="size-full object-contain" />
      ) : (
        <span
          className={cx(
            "leading-none font-semibold tracking-tight",
            party.short.length > 2 ? "text-[length:max(7px,28cqw)]" : "text-[length:max(8px,36cqw)]",
          )}
        >
          {party.short}
        </span>
      )}
    </span>
  );
}

/** Whether black letters read better than white ones on `hex` ("#f7cb5b"), by its relative luminance (WCAG). */
const isLight = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.179;
};

/** "María de los Ángeles Pérez" → "MÁ": first letters of the first two words that are not connectors. */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w) && !/^(de|del|la|las|los|y)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
