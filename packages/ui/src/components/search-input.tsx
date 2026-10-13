import { Input } from "@mt/ui/components/base/input/input";
import { cx } from "@mt/ui/lib/cx";
import { RiSearchLine } from "@remixicon/react";

/** Search field of the long lists (BoardUI `Input` with its icon), 44 px high. `label` is its accessible name. */
export function SearchInput({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Input
      type="search"
      aria-label={label}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      leadingIcon={RiSearchLine}
      className={cx("w-full sm:w-80", className)}
    />
  );
}
