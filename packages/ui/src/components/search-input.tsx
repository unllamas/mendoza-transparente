import { Search } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "../lib/utils.ts";

/** Search field with its icon, 44 px high. `label` is its accessible name. */
export function SearchInput({ label, className, ...props }: Omit<ComponentProps<"input">, "type"> & { label: string }) {
  return (
    <label className={cn("relative flex items-center sm:w-80", className)}>
      <Search className="pointer-events-none absolute left-3 size-4 text-ink-muted" aria-hidden />
      <input
        type="search"
        aria-label={label}
        className="min-h-11 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-base outline-none sm:text-sm placeholder:text-ink-muted focus:border-link"
        {...props}
      />
    </label>
  );
}
