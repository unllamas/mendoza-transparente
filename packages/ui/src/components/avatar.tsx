import { useState } from "react";

import { cn } from "../lib/utils.ts";

/**
 * Face of a person: their official photo, or their initials until there is one. Every mention of a person
 * uses it, so people can be recognized at a glance. Size it with `className` ("size-10 text-xs").
 */
export function PersonAvatar({ name, photo, className }: { name: string; photo: string | null | undefined; className?: string }) {
  const [error, setError] = useState(false);
  if (photo && !error) {
    return <img src={photo} alt="" loading="lazy" onError={() => setError(true)} className={cn("shrink-0 rounded-full bg-grid object-cover", className)} />;
  }
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-grid font-medium text-ink-2", className)} aria-hidden>
      {initials(name)}
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
