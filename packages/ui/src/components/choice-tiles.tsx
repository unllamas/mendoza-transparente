import { cx } from "@mt/ui/lib/cx";
import type { RemixiconComponentType } from "@remixicon/react";
import { Radio as AriaRadio, RadioGroup as AriaRadioGroup } from "react-aria-components";

/**
 * A few options that each open something different (the forms of /participar), all in sight at once: tiles with an icon,
 * a name and one line, two columns from tablet up. Unlike `Segmented`, it wraps instead of scrolling sideways, so it fits
 * options with long names. The chosen one in light blue, like every action; the rest white, lifted.
 */
export function ChoiceTiles<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string; description: string; icon: RemixiconComponentType }[];
  value: T | null;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <AriaRadioGroup aria-label={label} value={value} onChange={(v) => onChange(v as T)} className="grid gap-2 sm:grid-cols-2">
      {options.map(({ value: v, label: name, description, icon: Icon }) => (
        <AriaRadio
          key={v}
          value={v}
          className={({ isSelected, isFocusVisible }) =>
            cx(
              "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-[background-color,border-color,box-shadow] duration-200",
              isSelected
                ? "border-border-link bg-background-action"
                : "border-transparent bg-background-interactive shadow-card hover:border-border-link active:bg-background-interactive-hover",
              isFocusVisible && "ring-2 ring-border-focus-ring ring-offset-2",
            )
          }
        >
          {({ isSelected }) => (
            <>
              <Icon
                className={cx("mt-0.5 size-5 shrink-0", isSelected ? "text-text-action" : "text-foreground-icon-secondary")}
                aria-hidden
              />
              <span className="flex min-w-0 flex-col">
                <span className={cx("truncate text-body-medium", isSelected ? "text-text-action" : "text-text-link")}>{name}</span>
                <span className="text-caption-1-regular text-pretty text-text-secondary">{description}</span>
              </span>
            </>
          )}
        </AriaRadio>
      ))}
    </AriaRadioGroup>
  );
}
