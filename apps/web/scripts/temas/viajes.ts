/**
 * Viajes oficiales (/funcionarios/viajes): los decretos de misión oficial de la fuente `misiones-oficiales`,
 * agrupados en un viaje por decreto con todas las personas que viajan. Cada persona se cruza con su ficha de
 * funcionario (foto y link) y cada funcionario recibe la lista de sus viajes en `trips`. Quien no tiene ficha
 * (subsecretarios, directores, asesores) se cruza con su declaración en Ética Pública: de ahí sale el cargo cuando el
 * decreto no lo dice, y la foto oficial si la hay (`etica-<official_id>` en fotos.csv).
 * El organismo de cada viaje lo completa después `buildGobierno()`, con el mismo cruce que las designaciones.
 * Metodología: docs/procesos/metodologia.md#misiones-oficiales.
 */

import type { Funcionario, FuncionariosTema, Trip, TripCost, TripRef } from "../../src/types.ts";
import { normalize, properName, samePerson, sentence } from "./gobierno.ts";

type Row = Record<string, string>;

const COSTS = new Set<TripCost>(["paga_provincia", "paga_tercero", "sin_costo", "sin_viaticos", "no_informa"]);
const NORM_LABEL: Record<string, string> = { decreto: "Decreto", resolucion: "Resolución" };

/** "las Ciudades de Hamburgo, Bruselas" → "Hamburgo, Bruselas"; vacío → el país. */
function cleanDestination(destination: string, countries: string[]): string {
  const d = destination.replace(/^(?:las|los)\s+(?:ciudades|Ciudades)\s+de\s+/, "").trim();
  return d || countries.join(", ") || "Destino sin precisar";
}

/** La declaración de Ética Pública de alguien sin ficha: la vigente si hay; ninguna si el nombre es de más de una persona. */
function declared(name: string, etica: Row[]): Row | null {
  const matches = etica.filter((r) => samePerson(name, r.nombre!));
  if (new Set(matches.map((r) => normalize(r.nombre!))).size !== 1) return null;
  return matches.find((r) => !r.fecha_fin_cargo) ?? matches[0]!;
}

export function buildTrips(
  rows: Row[],
  funcionarios: FuncionariosTema | null | undefined,
  etica: Row[] = [],
  photoRows: Row[] = [],
): Trip[] {
  const people = funcionarios?.personas ?? [];
  const photos = new Map(photoRows.filter((r) => r.id?.startsWith("etica-")).map((r) => [r.id!, `/data/fotos/${r.foto}`]));
  // El cargo que dice el decreto más reciente de cada persona: sirve para los decretos que no lo dicen.
  const lastRole = new Map<string, string>();
  for (const r of [...rows].sort((x, y) => (y.fecha_boletin ?? "").localeCompare(x.fecha_boletin ?? "")))
    if (r.cargo && !lastRole.has(normalize(r.persona!))) lastRole.set(normalize(r.persona!), r.cargo);
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
        const decl = match ? null : declared(r.persona!, etica);
        return {
          name: match?.nombre ?? properName(r.persona!),
          role: r.cargo || match?.cargo || lastRole.get(normalize(r.persona!)) || (decl?.cargo ? sentence(decl.cargo) : ""),
          photo: match?.foto ?? (decl ? (photos.get(`etica-${decl.official_id}`) ?? null) : null),
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
