/** Población de Mendoza: total y por departamento (censos 2010 y 2022, proyecciones INDEC). */

import type { PoblacionTema } from "../../src/types.ts";

type CsvRow = Record<string, string>;

export function buildPoblacion(departamentos: CsvRow[], provincias: CsvRow[]): PoblacionTema {
  const anioActual = new Date().getFullYear();
  const mza = provincias.filter((r) => r.provincia === "Mendoza");
  const serie = mza
    .filter((r) => r.tipo === "proyeccion")
    .map((r) => ({ anio: Number(r.anio), poblacion: Number(r.poblacion), proyectado: Number(r.anio) > anioActual }))
    .sort((a, b) => a.anio - b.anio);
  const censo = (anio: string) => Number(mza.find((r) => r.anio === anio && r.tipo === "censo")?.poblacion ?? 0);

  const municipios = [...new Set(departamentos.map((r) => r.municipio!))].sort((a, b) => a.localeCompare(b, "es"));
  const deptos = municipios.map((municipio) => {
    const filas = departamentos.filter((r) => r.municipio === municipio);
    const c = (anio: string) => Number(filas.find((r) => r.anio === anio && r.tipo === "censo")?.poblacion ?? 0);
    const proy = filas.filter((r) => r.tipo === "proyeccion").map((r) => ({ anio: Number(r.anio), poblacion: Number(r.poblacion) }));
    const actual = proy.find((p) => p.anio === anioActual)?.poblacion ?? c("2022");
    return {
      municipio,
      censo2010: c("2010"),
      censo2022: c("2022"),
      variacion: c("2010") ? (c("2022") / c("2010") - 1) * 100 : 0,
      actual,
      serie: proy.sort((a, b) => a.anio - b.anio),
    };
  });

  return {
    anioActual,
    actual: serie.find((p) => p.anio === anioActual)?.poblacion ?? censo("2022"),
    censo2010: censo("2010"),
    censo2022: censo("2022"),
    serie,
    departamentos: deptos,
  };
}
