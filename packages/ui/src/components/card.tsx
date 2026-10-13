import { cx } from "@mt/ui/lib/cx";

/**
 * Informative block: background only, no border (the border is reserved for what can be tapped).
 * Sizes: `sm` for a figure inside a grid, `default` for a block, `lg` for a section of a page.
 */
const TILE_SIZE = { sm: "rounded-lg p-3", default: "rounded-xl p-4", lg: "rounded-2xl p-5" } as const;

export function tileVariants({ size = "default" }: { size?: keyof typeof TILE_SIZE } = {}) {
  return cx("bg-background-secondary-default", TILE_SIZE[size]);
}

/**
 * Clickable card: border + surface, border in link color on hover. Apply it to the link or button itself
 * (`className={cardVariants()}`) so the whole card is the target.
 */
const CARD_SIZE = { default: "rounded-xl p-4", lg: "rounded-2xl p-5" } as const;

export function cardVariants({ size = "default" }: { size?: keyof typeof CARD_SIZE } = {}) {
  return cx(
    "group min-h-11 border border-border-button-default bg-background-primary-default text-left shadow-xs transition-colors hover:border-link",
    CARD_SIZE[size],
  );
}
