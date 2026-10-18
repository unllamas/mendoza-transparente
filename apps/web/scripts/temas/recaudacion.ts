/**
 * Recaudación de la provincia por impuesto (data/processed/atm-recaudacion), en pesos de hoy. Todo se mide sobre los
 * mismos meses de cada año (enero hasta el último mes publicado), así el año en curso se compara con los anteriores.
 */

import type { RecaudacionTema } from "../../src/types.ts";
import { deflactor } from "./inflacion.ts";

type CsvRow = Record<string, string>;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** Longest history shown: more years dilute what is happening now. */
const YEARS_SHOWN = 8;
const TAXES: Record<string, string> = {
  ingresos_brutos: "Ingresos Brutos",
  sellos: "Sellos",
  automotor: "Automotor",
  inmobiliario: "Inmobiliario",
  varios: "Otros ingresos",
};

export function buildRecaudacion(rows: CsvRow[], ipc: CsvRow[], poblacion: CsvRow[], ron: CsvRow[]): RecaudacionTema | undefined {
  const defl = deflactor(ipc);
  if (!defl) return undefined;
  const taxRows = rows
    .filter((r) => r.impuesto! in TAXES)
    .map((r) => ({ anio: Number(r.anio), mes: Number(r.mes), impuesto: r.impuesto!, monto: Number(r.monto) }));

  const anio = Math.max(...taxRows.map((r) => r.anio));
  const hastaMes = Math.max(...taxRows.filter((r) => r.anio === anio).map((r) => r.mes));
  const real = (monto: number, year: number) => defl.aReal(monto, year);

  const byTax = (year: number) => {
    const totals = new Map<string, number>();
    for (const r of taxRows.filter((r) => r.anio === year && r.mes <= hastaMes))
      totals.set(r.impuesto, (totals.get(r.impuesto) ?? 0) + real(r.monto, year));
    return totals;
  };
  const sum = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);

  const firstYear = Math.max(Math.min(...taxRows.map((r) => r.anio)), anio - YEARS_SHOWN + 1);
  const serie = Array.from({ length: anio - firstYear + 1 }, (_, i) => firstYear + i).map((year) => ({
    anio: year,
    real: sum(byTax(year)),
  }));

  const now = byTax(anio);
  const before = byTax(anio - 1);
  const porImpuesto = Object.entries(TAXES)
    .map(([id, nombre]) => ({ id, nombre, actual: now.get(id) ?? 0, anterior: before.get(id) ?? 0 }))
    .sort((a, b) => b.actual - a.actual);

  const pop = poblacion.filter((r) => r.provincia === "Mendoza" && r.tipo === "proyeccion");
  const habitantes = Number((pop.find((r) => Number(r.anio) === anio) ?? pop.at(-1))?.poblacion ?? 0);

  // Automatic transfers from Nación (coparticipación and other laws) for the same months.
  const nationRows = ron.filter(
    (r) => r.provincia === "Mendoza" && Number(r.anio) === anio && Number(r.mes) <= hastaMes && r.concepto !== "total",
  );
  const nacion = nationRows.reduce((s, r) => s + real(Number(r.monto_pesos), anio), 0);
  const nationComplete = new Set(nationRows.map((r) => r.mes)).size === hastaMes;

  return {
    referencia: defl.referencia,
    anio,
    hastaMes,
    periodo: hastaMes === 12 ? "todo el año" : `ene–${MESES[hastaMes - 1]}`,
    serie,
    total: { actual: sum(now), anterior: sum(before) },
    perCapita: habitantes ? sum(now) / habitantes : 0,
    poblacion: habitantes,
    porImpuesto,
    frenteANacion: nationComplete ? { propios: sum(now), nacion } : null,
  };
}
