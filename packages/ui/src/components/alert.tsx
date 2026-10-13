import { Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../lib/utils.ts";

/**
 * Box for what has to be read.
 * - warning (amber): a problem or a signal (why a missing figure matters, sources that disagree…).
 * - note (neutral): a method note to read a number right (inflation, devaluation, limits).
 * For several flags about the same thing, use warning badges instead of stacking boxes.
 */
export function Alert({
  variant = "warning",
  title,
  children,
  className,
}: {
  variant?: "warning" | "note";
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const warning = variant === "warning";
  const Icon = warning ? TriangleAlert : Info;
  return (
    <div
      role={warning ? "note" : undefined}
      className={cn(
        "flex items-start gap-3 rounded-xl p-4 text-sm",
        warning ? "border border-aviso-borde bg-aviso-fondo" : "bg-tile",
        className,
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", warning ? "text-aviso" : "text-ink-muted")} aria-hidden />
      <div className="flex min-w-0 flex-col gap-1">
        {title && <span className="font-medium text-ink">{title}</span>}
        <div className="text-ink-2 text-pretty">{children}</div>
      </div>
    </div>
  );
}
