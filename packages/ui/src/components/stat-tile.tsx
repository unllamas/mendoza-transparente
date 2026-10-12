import type { LucideIcon } from "lucide-react";

import { Tile } from "./card.tsx";

/** A figure with its label and a note. Informative: background only. Value and label on one line. */
export function StatTile({ label, value, note, icon: Icon }: { label: string; value: string; note?: string; icon?: LucideIcon }) {
  return (
    <Tile className="flex flex-col gap-1">
      <span className="flex min-w-0 items-center gap-2 text-sm text-ink-2" title={label}>
        {Icon && <Icon className="size-4 shrink-0 text-ink-muted" aria-hidden />}
        <span className="truncate">{label}</span>
      </span>
      <span className="truncate text-2xl font-semibold tracking-tight whitespace-nowrap sm:text-3xl" title={value}>
        {value}
      </span>
      {note && <span className="text-xs text-ink-muted">{note}</span>}
    </Tile>
  );
}
