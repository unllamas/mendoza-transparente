import { SegmentedControl, SegmentedControlItem } from "@mt/ui/components/base/segmented-control/segmented-control";
import { cx } from "@mt/ui/lib/cx";

/**
 * Mutually exclusive options (the period of a chart, the order of a list), on BoardUI's `SegmentedControl`.
 * On phones it scrolls sideways inside its own strip instead of widening the page. 44 px high.
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
    <div className={cx("-mx-4 flex max-w-[100vw] overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:max-w-full sm:px-0", className)}>
      <SegmentedControl
        aria-label={label}
        selectedKeys={[value]}
        onSelectionChange={(keys) => {
          const [next] = [...keys];
          if (next !== undefined) onChange(next as T);
        }}
        className="shrink-0"
      >
        {options.map((o) => (
          <SegmentedControlItem key={o.value} id={o.value}>
            {o.label}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
    </div>
  );
}
