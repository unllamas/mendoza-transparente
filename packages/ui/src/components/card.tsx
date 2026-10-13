import { cx } from "@mt/ui/lib/cx";

/**
 * One surface for every card, informative or actionable: border + surface + soft shadow, same radius.
 * What can be tapped is told apart by what it shows before the hover (an arrow or a link-colored name, see
 * docs/procesos/diseno.md), and on hover its border takes the link color.
 */
const SURFACE = "rounded-xl border border-border-button-default bg-background-primary-default shadow-xs";
const PADDING = { sm: "p-3", default: "p-4", lg: "p-5" } as const;

/** Informative block (a figure, a summary, a list). Sizes: `sm` inside a grid, `default` for a block, `lg` for a section. */
export function tileVariants({ size = "default" }: { size?: keyof typeof PADDING } = {}) {
  return cx(SURFACE, PADDING[size]);
}

/** Actionable card: apply it to the link or button itself (`className={cardVariants()}`) so the whole card is the target. */
export function cardVariants({ size = "default" }: { size?: Exclude<keyof typeof PADDING, "sm"> } = {}) {
  return cx(
    SURFACE,
    PADDING[size],
    "group min-h-11 text-left transition-colors hover:border-border-link hover:bg-background-primary-hover",
  );
}

/**
 * Long list (people, agencies, processes): ONE block with its rows divided by a hairline, not a card per row.
 * Put `listVariants()` on the `<ul>` and `listRowVariants()` on each row's link or button (or on the `<li>` when
 * it is informative). Actionable rows show their arrow (`RiArrowRightSLine` in `text-text-link`) before hover.
 */
export function listVariants() {
  return cx(SURFACE, "flex flex-col divide-y divide-separator-border overflow-hidden");
}

export function listRowVariants({ interactive = true }: { interactive?: boolean } = {}) {
  return cx(
    "flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left",
    interactive && "group transition-colors hover:bg-background-primary-hover",
  );
}
