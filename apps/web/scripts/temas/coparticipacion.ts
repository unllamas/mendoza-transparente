/**
 * Coparticipación por municipio en pesos de hoy y por habitante.
 * Deflacta con el IPC nacional (promedio anual) y divide por la proyección de población de INDEC.
 */

import type { CoparticipacionTema } from "../../src/types.ts";

type CsvRow = Record<string, string>;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function buildCoparticipacion(anual: CsvRow[], ipc: CsvRow[], poblacion: CsvRow[]): CoparticipacionTema {
  const nacional = ipc.filter((r) => r.region === "nacional").map((r) => ({ anio: Number(r.anio), mes: Number(r.mes), indice: Number(r.indice) }));
  const ref = nacional.at(-1)!;
  const promedioAnual = new Map<number, number>();
  for (const anio of new Set(nacional.map((r) => r.anio))) {
    const meses = nacional.filter((r) => r.anio === anio);
    promedioAnual.set(anio, meses.reduce((s, r) => s + r.indice, 0) / meses.length);
  }
  const aReal = (monto: number, anio: number) => (monto * ref.indice) / promedioAnual.get(anio)!;

  const pob = new Map<string, number>();
  for (const r of poblacion) if (r.tipo === "proyeccion") pob.set(`${r.anio}|${r.municipio}`, Number(r.poblacion));

  const filas = anual.filter((r) => promedioAnual.has(Number(r.anio)));
  const parcial = new Set(filas.filter((r) => r.parcial === "1").map((r) => Number(r.anio)));
  const anioCompleto = Math.max(...filas.filter((r) => r.parcial !== "1").map((r) => Number(r.anio)));

  const municipios = [...new Set(filas.map((r) => r.municipio!))].sort((a, b) => a.localeCompare(b, "es"));
  const datos = municipios.map((municipio) => {
    const serie = filas
      .filter((r) => r.municipio === municipio)
      .map((r) => {
        const anio = Number(r.anio);
        const real = aReal(Number(r.monto_pesos), anio);
        const habitantes = pob.get(`${anio}|${municipio}`) ?? null;
        return { anio, nominal: Number(r.monto_pesos), real, perCapita: habitantes ? real / habitantes : null, parcial: parcial.has(anio) };
      })
      .sort((a, b) => a.anio - b.anio);
    const ultimo = serie.find((p) => p.anio === anioCompleto)!;
    return {
      municipio,
      poblacion: pob.get(`${anioCompleto}|${municipio}`) ?? 0,
      real: ultimo.real,
      perCapita: ultimo.perCapita ?? 0,
      serie,
    };
  });

  const anios = [...new Set(filas.map((r) => Number(r.anio)))].sort((a, b) => a - b);
  const provincia = anios.map((anio) => {
    const real = datos.reduce((s, m) => s + (m.serie.find((p) => p.anio === anio)?.real ?? 0), 0);
    const habitantes = municipios.reduce((s, m) => s + (pob.get(`${anio}|${m}`) ?? 0), 0);
    return { anio, real, perCapita: habitantes ? real / habitantes : null, parcial: parcial.has(anio) };
  });

  return {
    referencia: `${MESES[ref.mes - 1]} ${ref.anio}`,
    anioCompleto,
    totalReal: provincia.find((p) => p.anio === anioCompleto)!.real,
    municipios: datos,
    provincia,
  };
}
