/** Agregados para la página de Deuda, a partir de data/processed/hacienda-deuda-stock. */

import { GOBIERNOS } from "../../src/gobiernos.ts";
import type { DeudaTema } from "../../src/types.ts";

type CsvRow = Record<string, string>;

export function buildDeuda(trimestral: CsvRow[], stock: CsvRow[], poblacion: number): DeudaTema {
  const serie = trimestral
    .filter((r) => r.deuda_consolidada_usd_mill)
    .map((r) => ({ fecha: r.fecha_corte!, usd: Number(r.deuda_consolidada_usd_mill) }));

  const ultimoCorte = stock.reduce((max, r) => (r.fecha_corte! > max ? r.fecha_corte! : max), "");
  const vigentes = stock.filter((r) => r.fecha_corte === ultimoCorte && r.consolidada === "1");

  const agrupar = (campo: string) => {
    const totales = new Map<string, number>();
    for (const r of vigentes) totales.set(r[campo]!, (totales.get(r[campo]!) ?? 0) + Number(r.saldo_usd || 0));
    return [...totales].map(([nombre, usd]) => ({ nombre, usd })).sort((a, b) => b.usd - a.usd);
  };

  // Inicio y fin de cada mandato: el corte trimestral más cercano a la fecha de asunción y de salida.
  const cercano = (fecha: string) =>
    serie.reduce((best, p) =>
      Math.abs(Date.parse(p.fecha) - Date.parse(fecha)) < Math.abs(Date.parse(best.fecha) - Date.parse(fecha)) ? p : best,
    );
  const mandatos = GOBIERNOS.filter((g) => g.desde >= serie[0]!.fecha).map((g) => ({
    gobierno: g.nombre,
    desde: g.desde,
    hasta: g.hasta,
    inicio: cercano(g.desde),
    fin: g.hasta ? cercano(g.hasta) : serie.at(-1)!,
    enCurso: g.hasta === null,
  }));

  const ultimo = serie.at(-1)!;
  return {
    corte: ultimo.fecha,
    totalUsd: ultimo.usd,
    porHabitanteUsd: (ultimo.usd * 1e6) / poblacion,
    poblacion,
    serie,
    mandatos,
    porAcreedor: agrupar("acreedor"),
    porMoneda: agrupar("moneda"),
    instrumentos: vigentes
      .map((r) => ({
        instrumento: r.instrumento!,
        acreedor: r.acreedor!,
        moneda: r.moneda!,
        usd: Number(r.saldo_usd || 0),
        tasa: r.tasa ?? "",
        vencimiento: r.vencimiento ?? "",
      }))
      .sort((a, b) => b.usd - a.usd),
  };
}
