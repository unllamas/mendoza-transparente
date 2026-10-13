import { StatusDot } from "@mt/ui/components/base/badges/status-dot";
import { cx } from "@mt/ui/lib/cx";

const COLOR = { good: "green", warning: "yellow", critical: "red", neutral: "gray" } as const;

/** A state with its dot and its text, never color alone (a source that works, is pending or is broken). */
export function StatusBadge({ status, label, className }: { status: keyof typeof COLOR; label: string; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-body-regular text-text-secondary", className)}>
      <StatusDot color={COLOR[status]} />
      {label}
    </span>
  );
}
