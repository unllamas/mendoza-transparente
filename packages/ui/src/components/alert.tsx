import { cx } from "@mt/ui/lib/cx";
import { RiErrorWarningLine, RiInformationLine } from "@remixicon/react";
import type { ReactNode } from "react";

/**
 * Box for what has to be read (BoardUI tokens and icons).
 * - warning (amber): a problem or a signal (why a missing figure matters, sources that disagree…).
 * - note (neutral): a method note to read a number right (inflation, devaluation, limits).
 * For several flags about the same thing, use warning chips instead of stacking boxes.
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
  const Icon = warning ? RiErrorWarningLine : RiInformationLine;
  return (
    <div
      role={warning ? "note" : undefined}
      className={cx(
        "flex items-start gap-3 rounded-xl p-4 text-body-regular",
        warning ? "border border-aviso-borde bg-aviso-fondo" : "bg-background-secondary-default",
        className,
      )}
    >
      <Icon className={cx("mt-px size-5 shrink-0", warning ? "text-aviso" : "text-foreground-icon-secondary")} aria-hidden />
      <div className="flex min-w-0 flex-col gap-1">
        {title && <span className="text-body-medium text-text-primary">{title}</span>}
        <div className="text-text-secondary text-pretty">{children}</div>
      </div>
    </div>
  );
}
