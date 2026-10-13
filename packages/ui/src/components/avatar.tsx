import { Avatar } from "@mt/ui/components/base/avatar/avatar";
import { cx } from "@mt/ui/lib/cx";

/**
 * Face of a person (BoardUI `Avatar`): their official photo, or their initials until there is one or if it fails.
 * Every mention of a person uses it, so people can be recognized at a glance. Size it with `className` ("size-10 text-xs").
 */
export function PersonAvatar({ name, photo, className }: { name: string; photo: string | null | undefined; className?: string }) {
  return <Avatar src={photo ?? undefined} initials={initials(name)} aria-hidden className={cx("font-medium", className)} />;
}

/** "María de los Ángeles Pérez" → "MÁ": first letters of the first two words that are not connectors. */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w) && !/^(de|del|la|las|los|y)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
