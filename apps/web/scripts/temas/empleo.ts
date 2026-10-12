/** Agregados para la página de Empleo público, a partir de data/processed/dnap-ocupacion. */

import type { EmpleoTema } from "../../src/types.ts";

type CsvRow = Record<string, string>;

export function buildEmpleo(rows: CsvRow[]): EmpleoTema {
  const valor = (anio: string, provincia: string, concepto: string) =>
    Number(rows.find((r) => r.anio === anio && r.provincia === provincia && r.concepto === concepto)?.valor ?? NaN);

  const anio = rows.reduce((max, r) => (r.anio! > max ? r.anio! : max), "");
  const ranking = rows
    .filter((r) => r.anio === anio && r.concepto === "empleados_cada_mil_habitantes")
    .map((r) => ({ provincia: r.provincia!, cadaMil: Number(r.valor) }))
    .sort((a, b) => a.cadaMil - b.cadaMil);

  const serie = rows
    .filter((r) => r.provincia === "Mendoza" && r.concepto === "empleados_cada_mil_habitantes")
    .map((r) => ({ anio: Number(r.anio), cadaMil: Number(r.valor) }))
    .sort((a, b) => a.anio - b.anio);

  const totalPlanta = ranking.reduce((sum, r) => sum + valor(anio, r.provincia, "planta_ocupada"), 0);
  const totalHab = ranking.reduce((sum, r) => sum + valor(anio, r.provincia, "habitantes"), 0);

  return {
    anio: Number(anio),
    plantaMendoza: valor(anio, "Mendoza", "planta_ocupada"),
    cadaMilMendoza: valor(anio, "Mendoza", "empleados_cada_mil_habitantes"),
    posicion: ranking.findIndex((r) => r.provincia === "Mendoza") + 1,
    promedioPais: (totalPlanta / totalHab) * 1000,
    ranking,
    serie,
  };
}
