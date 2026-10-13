import { cx } from "@mt/ui/lib/cx";
import type { ComponentType } from "react";

import { tileVariants } from "./card.tsx";

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

/** A figure with its label and a note. Informative: background only. Value and label on one line. */
export function StatTile({ label, value, note, icon: Icon }: { label: string; value: string; note?: string; icon?: IconComponent }) {
  return (
    <div className={cx(tileVariants(), "flex flex-col gap-1")}>
      <span className="flex min-w-0 items-center gap-2 text-body-regular text-text-secondary" title={label}>
        {Icon && <Icon className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />}
        <span className="truncate">{label}</span>
      </span>
      <span
        className="truncate text-title-1-semibold tracking-tight whitespace-nowrap text-text-primary sm:text-display-4-semibold"
        title={value}
      >
        {value}
      </span>
      {note && <span className="text-caption-1-regular text-text-secondary">{note}</span>}
    </div>
  );
}
