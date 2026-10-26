import { StatusDot } from "@mt/ui/components/base/badges/status-dot";
import { listVariants } from "@mt/ui/components/card";
import { StatusBadge } from "@mt/ui/components/status-badge";
import { RiArrowDownSLine } from "@remixicon/react";
import { formatNumber } from "../labels.ts";
import type { AuditCase, AuditCheck } from "../types.ts";

const PERCENT = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1 });
/** Below 0,1 % the percent rounds to zero, which reads as "nothing": say it is less. */
const share = (n: number) => (n > 0 && n < 0.001 ? "menos del 0,1 %" : PERCENT.format(n));
const signed = (n: number) => `${n > 0 ? "+" : "−"}${formatNumber(Math.abs(n))}`;
const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n === 1 ? one : many}`;

/**
 * The automatic checks over the official figures of the office on screen, written for someone who has never seen a
 * scrutiny: each one answers its question in one sentence first ("¿cierran los números?"), and only when opened says
 * how it was checked and lists the cases, one per line, as "before → after". With `place`, only that department.
 * An alert is a signal to look at, never an accusation.
 */
export function AuditList({ checks, place }: { checks: AuditCheck[]; place?: string }) {
  const shown = checks
    .map((c) => ({
      check: c,
      counts: place ? c.lugares[place] : { revisados: c.revisados, alertas: c.alertas, hallados: c.hallados },
      cases: place ? c.casos.filter((x) => x.lugar === place) : c.casos,
    }))
    .filter((c) => c.counts && c.counts.revisados > 0);
  if (shown.length === 0)
    return <p className="text-body-regular text-text-secondary">Para este cargo todavía no hay controles: la fuente trae un solo nivel.</p>;
  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-3xl text-body-regular text-text-secondary text-pretty">
        Revisamos solos los números oficiales para ver si cierran. Lo que marcamos «para mirar» no es una acusación: puede ser un error de
        carga, de lectura del documento o una corrección que la Junta Electoral hizo bien.
      </p>
      <ul className={listVariants()}>
        {shown.map(({ check, counts, cases }) => {
          const { revisados, alertas, hallados } = counts!;
          return (
            <li key={check.id}>
              <details className="group/details">
                <summary className="group flex min-h-11 w-full cursor-pointer list-none items-center gap-3 bg-background-interactive px-4 py-3 text-left transition-colors hover:bg-background-interactive-hover [&::-webkit-details-marker]:hidden">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-body-medium text-text-primary text-pretty">{check.titulo}</span>
                    <span className="text-body-regular text-text-secondary text-pretty">
                      {verdict(check, cases, hallados, alertas, !place)}
                    </span>
                  </span>
                  <StatusBadge
                    status={alertas > 0 ? "warning" : "good"}
                    label={alertas > 0 ? `${formatNumber(alertas)} para mirar` : "Cierra"}
                    className="shrink-0 whitespace-nowrap"
                  />
                  <RiArrowDownSLine
                    className="size-5 shrink-0 text-text-link transition-transform group-open/details:rotate-180"
                    aria-hidden
                  />
                </summary>
                <div className="flex flex-col gap-3 border-t border-border-button-default bg-background-full px-4 py-3">
                  <p className="text-caption-1-regular text-text-secondary text-pretty">
                    <span className="font-medium text-text-primary">Cómo lo revisamos.</span> {check.descripcion} Revisamos{" "}
                    {formatNumber(revisados)} {revisados === 1 ? check.unidad.replace(/s\b/g, "") : check.unidad}.
                  </p>
                  {cases.length > 0 && <Cases cases={cases} grouped={!place} />}
                  {hallados > cases.length && (
                    <p className="text-caption-1-regular text-text-secondary">
                      Mostramos los {formatNumber(cases.length)} más grandes de {plural(hallados, "caso", "casos")}.
                    </p>
                  )}
                  {cases.some((c) => /recurridos|impugnados/i.test(c.que ?? c.texto)) && (
                    <p className="text-caption-1-regular text-text-secondary text-pretty">
                      <span className="font-medium text-text-primary">Recurridos e impugnados.</span> Son votos que un fiscal objetó en la
                      mesa. En el escrutinio oficial la Junta Electoral decide si valen, y para quién, o si se anulan: por eso pasan a cero
                      y suben los de alguna lista, los nulos o los blancos.
                    </p>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The answer of a check in one plain sentence, with its largest case when there is one. */
function verdict(check: AuditCheck, cases: AuditCase[], found: number, alerts: number, withPlace: boolean) {
  const top = cases.find((c) => c.antes != null && c.despues != null);
  const where = top && withPlace ? ` en ${top.lugar}` : "";
  switch (check.id) {
    case "provisorio-definitivo":
      if (found === 0) return "No cambió ningún voto entre los dos conteos.";
      if (alerts > 0)
        return `${plural(alerts, "cambio mueve", "cambios mueven")} más del 1 % de los votos o cambia quién ganó. Conviene mirarlos con la fuente.`;
      return top
        ? `Cambiaron algunos votos, como es normal, y ninguno cambió quién ganó. El cambio más grande: ${top.que}${where}, ${signed(top.despues! - top.antes!)} (${share(top.parte ?? 0)} de los votos).`
        : "Cambiaron algunos votos, como es normal, y ninguno cambió quién ganó.";
    case "sumas":
      return found === 0
        ? "Las mesas suman exactamente lo que dice el total oficial."
        : `En ${plural(found, "caso", "casos")} las mesas no suman lo mismo que el total oficial.`;
    case "participacion":
      return found === 0
        ? "Ninguna mesa tiene más votos que votantes, ni más votantes que electores."
        : `${plural(found, "mesa o departamento tiene", "mesas o departamentos tienen")} más votos que votantes o más votantes que electores.`;
    case "mesas-sin-escrutar":
      return found === 0
        ? "Se contaron todas las mesas."
        : `${plural(found, "departamento tiene", "departamentos tienen")} mesas sin contar.`;
  }
}

/** The cases, by department when there are several: what changed, "before → after" and the difference. */
function Cases({ cases, grouped }: { cases: AuditCase[]; grouped: boolean }) {
  const byPlace = new Map<string, AuditCase[]>();
  for (const c of cases) byPlace.set(c.lugar, [...(byPlace.get(c.lugar) ?? []), c]);
  return (
    <div className="flex flex-col gap-3">
      {[...byPlace].map(([place, items]) => (
        <div key={place} className="flex flex-col gap-1">
          {grouped && <h4 className="text-caption-1-medium text-text-primary">{place}</h4>}
          <ul className="flex flex-col divide-y divide-border-button-default">
            {items.map((c) => (
              <li key={`${c.mesa ?? ""}|${c.que ?? c.texto}`} className="flex items-start gap-2 py-1.5 text-caption-1-regular">
                <StatusDot color={c.alerta ? "yellow" : "gray"} className="mt-0.5" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-text-primary" title={c.que ?? c.texto}>
                    {c.alerta && <span className="sr-only">Para mirar: </span>}
                    {c.mesa ? `Mesa ${c.mesa.replace(/^mesa\s*/i, "")}` : (c.que ?? c.texto)}
                  </span>
                  {c.antes != null && c.despues != null ? (
                    <span className="text-text-secondary tabular-nums">
                      {formatNumber(c.antes)} → {formatNumber(c.despues)} ·{" "}
                      <span className="font-medium text-text-primary">{signed(c.despues - c.antes)}</span>
                      {c.parte != null && ` (${share(c.parte)} de los votos)`}
                    </span>
                  ) : (
                    (c.mesa || c.que) && <span className="text-text-secondary text-pretty">{c.texto}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
