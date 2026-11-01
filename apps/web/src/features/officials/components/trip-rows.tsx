import { Chip } from "@mt/ui/components/base/badges/chip";
import { listRowVariants, listVariants } from "@mt/ui/components/card";
import { RiArrowRightSLine } from "@remixicon/react";
import { Link } from "@tanstack/react-router";

import { formatDate } from "@/lib.ts";
import type { TripCost, TripRef } from "@/types.ts";

/** Lo que dice el decreto sobre el costo, en pocas palabras. Metodología: docs/procesos/metodologia.md#misiones-oficiales. */
export const COST_LABEL: Record<TripCost, string> = {
  paga_provincia: "Paga la Provincia",
  paga_tercero: "Lo paga otro",
  sin_costo: "Sin costo, dice",
  sin_viaticos: "Sin viáticos, dice",
  no_informa: "No dice el costo",
};

/** La misma idea, en una oración, para la hoja de detalle. */
export const COST_SENTENCE: Record<TripCost, string> = {
  paga_provincia: "El decreto dice que la Provincia paga pasajes, estadía o viáticos.",
  paga_tercero: "El decreto dice que lo paga otro: la organización del evento, otro gobierno o un organismo federal o internacional.",
  sin_costo: "El decreto dice que el viaje no tiene costo para la Provincia.",
  sin_viaticos: "El decreto solo dice que no se pagan viáticos. No aclara quién pagó los pasajes ni la estadía.",
  no_informa: "El decreto no dice nada sobre el costo. Eso no significa que el viaje no haya costado nada.",
};

export function CostChip({ cost }: { cost: TripCost }) {
  return (
    <Chip variant="caption" color={cost === "paga_provincia" ? "brand" : "soft"} className="w-fit shrink-0">
      {COST_LABEL[cost]}
    </Chip>
  );
}

/** "Santiago de Chile · 26 ago 2026". */
export const tripTitle = (t: Pick<TripRef, "destination" | "countries">) =>
  t.countries.length && !t.countries.some((c) => t.destination.includes(c)) ? `${t.destination}, ${t.countries.join(", ")}` : t.destination;

/**
 * Viajes de una persona o de un organismo: cada fila abre el viaje en /funcionarios/viajes (`?viaje=<id>`).
 * `showTravelers` suma quiénes viajaron (en la ficha de un organismo; en la de una persona sobra).
 */
export function TripRows({ trips, showTravelers = false, track }: { trips: TripRef[]; showTravelers?: boolean; track: string }) {
  return (
    <ul className={listVariants()}>
      {trips.map((t) => (
        <li key={t.id}>
          <Link to="/funcionarios/viajes" search={{ viaje: t.id } as never} data-track={track} className={listRowVariants()}>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-medium text-text-link">{tripTitle(t)}</span>
              <span className="truncate text-body-regular text-text-tertiary">
                {[t.from ? formatDate(t.from) : null, showTravelers ? t.travelers.join(", ") : t.reason].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="hidden sm:block">
              <CostChip cost={t.cost} />
            </span>
            <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
