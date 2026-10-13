import type { ComponentProps, ReactNode } from "react";

import { cn } from "../lib/utils.ts";

/** Shared look of every form control: 44 px high, border, link-colored border on hover and focus.
 *  16 px text on phones: below that, iOS zooms the page when the field gets focus. */
const control =
  "w-full rounded-lg border border-line bg-surface px-3 text-base text-ink outline-none sm:text-sm placeholder:text-ink-muted hover:border-link focus:border-link disabled:opacity-50";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "min-h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "resize-y py-2.5 leading-relaxed", className)} {...props} />;
}

/** Native select (the phone's own picker is the most comfortable one), with the same look as the inputs. */
export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(control, "min-h-11", className)} {...props} />;
}

/** A form field: its label above, the control, and an optional hint below. */
export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5 text-sm", className)}>
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}
