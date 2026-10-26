import { listRowVariants, listVariants } from "@mt/ui/components/card";
import { StatusBadge } from "@mt/ui/components/status-badge";
import { cx } from "@mt/ui/lib/cx";
import { RiArrowDownSLine } from "@remixicon/react";
import { formatNumber } from "../labels.ts";
import type { AuditCheck } from "../types.ts";

/**
 * The automatic checks over the official figures of the office on screen. Each one says what it compared and how
 * many cases it found; the cases open below. An alert is a signal to look at, never an accusation.
 */
export function AuditList({ checks }: { checks: AuditCheck[] }) {
  if (checks.length === 0)
    return <p className="text-body-regular text-text-secondary">Para este cargo todavía no hay controles: la fuente trae un solo nivel.</p>;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-regular text-text-secondary text-pretty">
        Controles automáticos sobre los datos oficiales. Una alerta es algo para mirar con la fuente en la mano, no una acusación: puede ser
        un error de carga, de lectura del documento o un cambio legítimo del escrutinio.
      </p>
      <ul className={listVariants()}>
        {checks.map((c) => (
          <li key={c.id}>
            <details className="group/details">
              <summary
                className={cx(
                  listRowVariants({ interactive: c.casos.length > 0 }),
                  "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
                  c.casos.length === 0 && "cursor-default",
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-body-medium text-text-primary text-pretty">{c.titulo}</span>
                  <span className="text-caption-1-regular text-text-secondary text-pretty">
                    {c.descripcion} Revisamos {formatNumber(c.revisados)} {c.unidad}.
                  </span>
                </span>
                <StatusBadge
                  status={c.alertas > 0 ? "warning" : c.hallados > 0 ? "neutral" : "good"}
                  label={badge(c)}
                  className="shrink-0"
                />
                {c.casos.length > 0 && (
                  <RiArrowDownSLine
                    className="size-5 shrink-0 text-text-link transition-transform group-open/details:rotate-180"
                    aria-hidden
                  />
                )}
              </summary>
              {c.casos.length > 0 && (
                <ol className="flex flex-col gap-1 border-t border-border-button-default bg-background-full px-4 py-3 text-caption-1-regular text-text-secondary">
                  {c.casos.map((text) => (
                    <li key={text} className="tabular-nums">
                      {text}
                    </li>
                  ))}
                  {c.hallados > c.casos.length && <li>Y {formatNumber(c.hallados - c.casos.length)} casos más.</li>}
                </ol>
              )}
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

function badge(c: AuditCheck) {
  if (c.alertas > 0) return `${formatNumber(c.alertas)} ${c.alertas === 1 ? "alerta" : "alertas"}`;
  if (c.hallados > 0) return `${formatNumber(c.hallados)} ${c.hallados === 1 ? "cambio chico" : "cambios chicos"}`;
  return "Sin alertas";
}
