import { cx } from "@mt/ui/lib/cx";

/**
 * Two looks on the light-grey page (docs/procesos/diseno.md): what can be tapped is white, lifted with a shadow and
 * shows its action before the hover (an arrow or a link-colored name); what only informs stays flat on the page grey
 * with a hairline border. Same radius for both, so the only difference is "lifted or flat".
 */
const SHAPE = "rounded-xl border";
const SURFACE = `${SHAPE} border-border-button-default bg-transparent`;
const INTERACTIVE = `${SHAPE} border-transparent bg-background-interactive shadow-card`;
const PADDING = { sm: "p-3", default: "p-4", lg: "p-5" } as const;

/**
 * Informative block (a figure, a summary, a list). Sizes: `sm` inside a grid, `default` for a block, `lg` for a section.
 * `floating` for one that sits over other content (a chart's reading): it needs the white surface and a shadow.
 */
export function tileVariants({ size = "default", floating = false }: { size?: keyof typeof PADDING; floating?: boolean } = {}) {
  return cx(SURFACE, PADDING[size], floating && "bg-background-surface shadow-lg");
}

/** Actionable card: apply it to the link or button itself (`className={cardVariants()}`) so the whole card is the target. */
export function cardVariants({ size = "default" }: { size?: Exclude<keyof typeof PADDING, "sm"> } = {}) {
  return cx(
    INTERACTIVE,
    PADDING[size],
    "group min-h-11 text-left transition-[background-color,border-color,box-shadow] hover:border-border-link hover:shadow-card-hover",
  );
}

/**
 * Long list (people, agencies, processes): ONE block with its rows divided by a hairline, not a card per row.
 * Put `listVariants()` on the `<ul>` and `listRowVariants()` on each row's link or button: those rows are white.
 * An informative row (`listRowVariants({ interactive: false })`, on the `<li>` or a `<div>`) takes the page grey.
 * The list lifts itself (white, shadow, no border) as soon as one of its rows can be tapped, so in a mixed list you
 * see at a glance which rows can be tapped. Actionable rows show their arrow (`RiArrowRightSLine` in
 * `text-text-link`) before hover.
 */
export function listVariants() {
  return cx(
    SURFACE,
    "flex flex-col divide-y divide-border-button-default overflow-hidden",
    "has-[>li>.bg-background-interactive]:border-transparent has-[>li>.bg-background-interactive]:bg-background-interactive has-[>li>.bg-background-interactive]:shadow-card",
  );
}

export function listRowVariants({ interactive = true }: { interactive?: boolean } = {}) {
  return cx(
    "flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left",
    // An informative row takes the page grey, so inside a lifted (white) list it reads as "this one doesn't go anywhere".
    interactive ? "group bg-background-interactive transition-colors hover:bg-background-interactive-hover" : "bg-background-full",
  );
}
