import { cn } from "../lib/utils.ts";

const STATUS = {
  good: { color: "bg-good", icon: "✓" },
  warning: { color: "bg-warning", icon: "…" },
  critical: { color: "bg-critical", icon: "!" },
  neutral: { color: "bg-axis", icon: "·" },
} as const;

/** A state with its icon and its text, never color alone (a source that works, is pending or is broken). */
export function StatusBadge({ status, label, className }: { status: keyof typeof STATUS; label: string; className?: string }) {
  const s = STATUS[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm text-ink-2", className)}>
      <span aria-hidden className={cn("inline-flex size-4 items-center justify-center rounded-full text-[10px] font-bold text-white", s.color)}>
        {s.icon}
      </span>
      {label}
    </span>
  );
}
