import { IconButton } from "@mt/ui/components/base/buttons/icon-button";
import { listRowVariants, listVariants } from "@mt/ui/components/card";
import { type RemixiconComponentType, RiArrowRightSLine, RiCloseLine, RiSearchLine } from "@remixicon/react";
import { useState } from "react";
import { normalizeText } from "@/lib.ts";

export interface SearchItem {
  label: string;
  /** Shown before the label, so a long list is read by its icons (the activities). */
  icon?: RemixiconComponentType;
  /** Other ways of saying it, matched by the search but not shown. */
  words?: string[];
}

/**
 * Picker over the panel: a search on top and one column that scrolls under it. Used for the municipality and for the
 * activity; the search ignores accents and also matches each item's synonyms.
 */
export function SearchSheet({
  title,
  searchLabel,
  empty,
  items,
  askFree,
  onPick,
  onClose,
}: {
  title: string;
  searchLabel: string;
  empty: string;
  items: SearchItem[];
  /** When nothing matches, offer to send what was typed anyway (an activity we do not have yet is noted for later). */
  askFree?: (query: string) => string;
  onPick: (label: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = normalizeText(query.trim());
  const shown = items.filter((i) => [i.label, ...(i.words ?? [])].some((w) => normalizeText(w).includes(q)));
  return (
    <div className="absolute inset-0 z-10 flex flex-col justify-end">
      <button type="button" aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div role="dialog" aria-label={title} className="relative flex h-[85%] flex-col gap-1 rounded-t-3xl bg-background-full shadow-2xl">
        <span className="mx-auto mt-2 h-1 w-10 rounded-full bg-border-button-default" aria-hidden />
        <div className="flex h-14 shrink-0 items-center pr-3 pl-5">
          <span className="mr-auto text-headline-medium text-text-primary">{title}</span>
          <IconButton icon={RiCloseLine} aria-label="Cerrar" onClick={onClose} />
        </div>
        <div className="shrink-0 px-5 pb-4">
          <label className="flex h-12 items-center gap-2 rounded-2xl bg-background-surface px-4 shadow-card focus-within:ring-2 focus-within:ring-border-focus-ring">
            <RiSearchLine className="size-5 shrink-0 text-text-tertiary" aria-hidden />
            <input
              aria-label={searchLabel}
              placeholder={searchLabel}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent text-body-regular text-text-primary outline-none placeholder:text-text-tertiary max-sm:text-base"
            />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {shown.length ? (
            <ul className={listVariants()}>
              {shown.map((item) => (
                <li key={item.label}>
                  <button type="button" onClick={() => onPick(item.label)} className={listRowVariants()}>
                    {item.icon && <item.icon className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />}
                    <span className="min-w-0 flex-1 truncate text-body-regular text-text-primary">{item.label}</span>
                    <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col gap-4 py-6">
              <p className="text-center text-body-regular text-pretty text-text-secondary">{empty}</p>
              {askFree && query.trim() && (
                <ul className={listVariants()}>
                  <li>
                    <button type="button" onClick={() => onPick(query.trim())} className={listRowVariants()}>
                      <span className="min-w-0 flex-1 truncate text-body-medium text-text-link">{askFree(query.trim())}</span>
                      <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
                    </button>
                  </li>
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
