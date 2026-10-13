import { cn } from "../lib/utils.ts";

/**
 * Mutually exclusive options (the period of a chart, the order of a list). On phones it scrolls sideways
 * inside its own strip instead of widening the page. Each option keeps a 36 px height inside a 44 px control.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("-mx-4 flex max-w-[100vw] overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:max-w-full sm:px-0", className)}
    >
      <div className="inline-flex shrink-0 rounded-lg border border-line bg-surface p-0.5 text-sm">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-9 rounded-md px-3 whitespace-nowrap transition-colors",
              o.value === value ? "bg-grid font-medium text-ink" : "text-ink-2 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
