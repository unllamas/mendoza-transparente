/**
 * Viajes oficiales (/funcionarios/viajes): los decretos de misión oficial de la fuente `misiones-oficiales`,
 * agrupados en un viaje por decreto con todas las personas que viajan. Cada persona se cruza con su ficha de
 * funcionario (foto y link) y cada funcionario recibe la lista de sus viajes en `trips`.
 * El organismo de cada viaje lo completa después `buildGobierno()`, con el mismo cruce que las designaciones.
 * Metodología: docs/procesos/metodologia.md#misiones-oficiales.
 */

import type { Funcionario, FuncionariosTema, Trip, TripCost, TripRef } from "../../src/types.ts";
import { properName, samePerson, sentence } from "./gobierno.ts";

type Row = Record<string, string>;

const COSTS = new Set<TripCost>(["paga_provincia", "paga_tercero", "sin_costo", "sin_viaticos", "no_informa"]);
const NORM_LABEL: Record<string, string> = { decreto: "Decreto", resolucion: "Resolución" };

/** "las Ciudades de Hamburgo, Bruselas" → "Hamburgo, Bruselas"; vacío → el país. */
function cleanDestination(destination: string, countries: string[]): string {
  const d = destination.replace(/^(?:las|los)\s+(?:ciudades|Ciudades)\s+de\s+/, "").trim();
  return d || countries.join(", ") || "Destino sin precisar";
}

export function buildTrips(rows: Row[], funcionarios: FuncionariosTema | null | undefined): Trip[] {
  const people = funcionarios?.personas ?? [];
  const byNorm = new Map<string, Row[]>();
  for (const r of rows) byNorm.set(r.norma_id!, [...(byNorm.get(r.norma_id!) ?? []), r]);

  const trips: Trip[] = [];
  for (const [id, group] of byNorm) {
    const first = group[0]!;
    const countries = [
      ...new Set(
        (first.pais ?? "")
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
      ),
    ];
    const cost = (COSTS.has(first.costo_provincia as TripCost) ? first.costo_provincia : "no_informa") as TripCost;
    const year = (first.fecha_norma || first.fecha_boletin || "").slice(0, 4);
    trips.push({
      id,
      from: first.desde || null,
      to: first.hasta || null,
      days: Number(first.dias) || null,
      destination: cleanDestination(first.destino ?? "", countries),
      countries,
      reason: first.motivo ?? "",
      cost,
      costText: first.detalle_costo ?? "",
      norm: `${NORM_LABEL[first.tipo_norma ?? ""] ?? "Norma"} ${first.numero_norma}${year ? `/${year}` : ""}`,
      normDate: first.fecha_norma || null,
      published: first.fecha_boletin!,
      issuer: sentence(first.organismo_emisor ?? ""),
      agency: null,
      url: first.url_pdf ?? "",
      travelers: group.map((r) => {
        const match = people.find((p) => samePerson(r.persona!, p.nombre));
        return {
          name: match?.nombre ?? properName(r.persona!),
          role: r.cargo || match?.cargo || "",
          photo: match?.foto ?? null,
          path: match ? `/funcionarios/${match.role}/${match.slug}` : null,
        };
      }),
    });
  }
  // Del más reciente al más viejo; sin fecha de salida, por la fecha del decreto.
  return trips.sort((a, b) => (b.from ?? b.normDate ?? "").localeCompare(a.from ?? a.normDate ?? ""));
}

export const tripRef = (t: Trip): TripRef => ({
  id: t.id,
  from: t.from,
  destination: t.destination,
  countries: t.countries,
  reason: t.reason,
  cost: t.cost,
  travelers: t.travelers.map((x) => x.name),
});

/** Suma a cada funcionario con ficha la lista de sus viajes. */
export function attachTrips(personas: Funcionario[], trips: Trip[]) {
  for (const p of personas) {
    const path = `/funcionarios/${p.role}/${p.slug}`;
    const own = trips.filter((t) => t.travelers.some((x) => x.path === path)).map(tripRef);
    if (own.length) p.trips = own;
    else delete p.trips;
  }
}
