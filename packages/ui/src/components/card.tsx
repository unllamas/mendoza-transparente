import { cx } from "@mt/ui/lib/cx";

/**
 * One shape for every card: border + soft shadow + same radius. Informative blocks sit on the surface color;
 * what can be tapped sits on `background-interactive` (a grey between the page and the border, like every input and
 * secondary button), shows its action before the hover (an arrow or a link-colored name, see
 * docs/procesos/diseno.md), and on hover its border takes the link color.
 */
const SHAPE = "rounded-xl border border-border-button-default shadow-xs";
const SURFACE = `${SHAPE} bg-background-primary-default`;
const INTERACTIVE = `${SHAPE} bg-background-interactive`;
const PADDING = { sm: "p-3", default: "p-4", lg: "p-5" } as const;

/** Informative block (a figure, a summary, a list). Sizes: `sm` inside a grid, `default` for a block, `lg` for a section. */
export function tileVariants({ size = "default" }: { size?: keyof typeof PADDING } = {}) {
  return cx(SURFACE, PADDING[size]);
}

/** Actionable card: apply it to the link or button itself (`className={cardVariants()}`) so the whole card is the target. */
export function cardVariants({ size = "default" }: { size?: Exclude<keyof typeof PADDING, "sm"> } = {}) {
  return cx(
    INTERACTIVE,
    PADDING[size],
    "group min-h-11 text-left transition-colors hover:border-border-link hover:bg-background-interactive-hover",
  );
}

/**
 * Long list (people, agencies, processes): ONE block with its rows divided by a hairline, not a card per row.
 * Put `listVariants()` on the `<ul>` and `listRowVariants()` on each row's link or button: those rows sit on
 * `background-interactive`. An informative row (`listRowVariants({ interactive: false })`, on the `<li>` or a `<div>`)
 * sits on the surface, so in a mixed list you see at a glance which rows can be tapped. Actionable rows show their arrow (`RiArrowRightSLine` in `text-text-link`) before hover.
 */
export function listVariants() {
  return cx(SURFACE, "flex flex-col divide-y divide-border-button-default overflow-hidden");
}

export function listRowVariants({ interactive = true }: { interactive?: boolean } = {}) {
  return cx(
    "flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left",
    interactive
      ? "group bg-background-interactive transition-colors hover:bg-background-interactive-hover"
      : "bg-background-primary-default",
  );
}
