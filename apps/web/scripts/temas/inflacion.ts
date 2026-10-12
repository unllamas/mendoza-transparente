/** Ajuste por inflación con el IPC nacional de INDEC (data/processed/indices). */

type CsvRow = Record<string, string>;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export interface Deflactor {
  /** Mes al que quedan expresados los pesos de hoy ("ago 2026"). */
  referencia: string;
  /** Monto de un año, en pesos del mes de referencia (con el índice promedio de ese año). */
  aReal: (monto: number, anio: number) => number;
}

export function deflactor(ipc: CsvRow[]): Deflactor | null {
  const nacional = ipc
    .filter((r) => r.region === "nacional")
    .map((r) => ({ anio: Number(r.anio), mes: Number(r.mes), indice: Number(r.indice) }))
    .sort((a, b) => a.anio * 12 + a.mes - (b.anio * 12 + b.mes));
  const ref = nacional.at(-1);
  if (!ref) return null;
  const promedio = new Map<number, number>();
  for (const anio of new Set(nacional.map((r) => r.anio))) {
    const meses = nacional.filter((r) => r.anio === anio);
    promedio.set(anio, meses.reduce((s, r) => s + r.indice, 0) / meses.length);
  }
  return {
    referencia: `${MESES[ref.mes - 1]} ${ref.anio}`,
    aReal: (monto, anio) => (promedio.has(anio) ? (monto * ref.indice) / promedio.get(anio)! : monto),
  };
}
