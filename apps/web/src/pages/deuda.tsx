import { getRouteApi, Link } from "@tanstack/react-router";

import { BarList } from "../charts/bar-list.tsx";
import { LineChart } from "../charts/line-chart.tsx";
import { GOBIERNOS } from "../gobiernos.ts";
import { formatDate, formatNumber } from "../lib.ts";
import { Section, StatTile } from "./components.tsx";

const route = getRouteApi("/deuda");

const usdM = (v: number) => `US$ ${formatNumber(Math.round(v))} M`;
const trimestre = (fecha: string) => {
  const [y, m] = fecha.split("-");
  return `${Math.ceil(Number(m) / 3)}.º trim. ${y}`;
};
const FUENTE = "https://sitios.mendoza.gob.ar/haciendayfinanzas/stock-vigente/";

export function DeudaPage() {
  const deuda = route.useLoaderData();
  const pico = deuda.serie.reduce((max, p) => (p.usd > max.usd ? p : max));

  return (
    <div className="flex flex-col gap-12">
      <div className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">¿Cuánto debe Mendoza?</h1>
        <p className="text-ink-2 text-pretty">
          La deuda pública consolidada de la provincia: bonos, préstamos de organismos internacionales y de bancos. Los
          montos están en dólares para poder comparar años con distinta inflación.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <StatTile label="Deuda consolidada" value={usdM(deuda.totalUsd)} note={`Al ${formatDate(deuda.corte)}`} />
        <StatTile
          label="Por habitante"
          value={`US$ ${formatNumber(Math.round(deuda.porHabitanteUsd))}`}
          note={`Sobre ${formatNumber(deuda.poblacion)} habitantes (proyección INDEC)`}
        />
        <StatTile label="Máximo de la serie" value={usdM(pico.usd)} note={trimestre(pico.fecha)} />
      </div>

      <Section title="Evolución de la deuda">
        <div className="rounded-xl border border-line bg-surface p-4">
          <LineChart
            data={deuda.serie.map((p) => ({ fecha: p.fecha, valor: p.usd }))}
            bands={GOBIERNOS.map((g) => ({ desde: g.desde, hasta: g.hasta, label: g.nombre }))}
            formatValue={usdM}
            formatDate={trimestre}
            ariaLabel="Deuda consolidada de Mendoza en millones de dólares, por trimestre"
          />
        </div>
        <p className="text-sm text-ink-muted text-pretty">
          Deuda consolidada en millones de dólares al cierre de cada trimestre. Las franjas marcan cada gobernación.
          Ojo: la deuda tomada en pesos baja medida en dólares cuando el peso se devalúa, aunque no se haya pagado.
        </p>
      </Section>

      <Section title="Por mandato">
        <div className="grid gap-3 md:grid-cols-3">
          {deuda.mandatos.map((m) => {
            const delta = m.fin.usd - m.inicio.usd;
            return (
              <div key={m.desde} className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4">
                <span className="text-sm text-ink-2">
                  {m.gobierno} {m.desde.slice(0, 4)}–{m.hasta ? m.hasta.slice(0, 4) : "hoy"}
                </span>
                <span className="text-2xl font-semibold tracking-tight tabular-nums">
                  {delta >= 0 ? "+" : "−"}
                  {usdM(Math.abs(delta))}
                </span>
                <span className="text-xs text-ink-muted tabular-nums">
                  De {usdM(m.inicio.usd)} ({trimestre(m.inicio.fecha)}) a {usdM(m.fin.usd)} ({trimestre(m.fin.fecha)})
                  {m.enCurso && " · en curso"}
                </span>
              </div>
            );
          })}
        </div>
      </Section>

      <div className="grid gap-12 md:grid-cols-2">
        <Section title="¿A quién le debe?">
          <BarList
            items={deuda.porAcreedor.map((a) => ({
              nombre: a.nombre,
              valor: a.usd,
              detalle: `${Math.round((a.usd / deuda.totalUsd) * 100)}%`,
            }))}
            formatValue={usdM}
          />
        </Section>
        <Section title="¿En qué moneda?">
          <BarList
            items={deuda.porMoneda.map((a) => ({
              nombre: a.nombre,
              valor: a.usd,
              detalle: `${Math.round((a.usd / deuda.totalUsd) * 100)}%`,
            }))}
            formatValue={usdM}
          />
          <p className="text-sm text-ink-muted">
            "Pesos ajustados" son deudas en pesos que se actualizan por inflación (CER) o por otro índice.
          </p>
        </Section>
      </div>

      <Section title="Instrumentos vigentes">
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Instrumento</th>
                <th className="px-4 py-3 font-medium">Acreedor</th>
                <th className="px-4 py-3 font-medium">Moneda</th>
                <th className="px-4 py-3 text-right font-medium">Saldo</th>
                <th className="px-4 py-3 font-medium">Tasa</th>
                <th className="px-4 py-3 font-medium">Vence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {deuda.instrumentos.map((i) => (
                <tr key={i.instrumento + i.vencimiento}>
                  <td className="px-4 py-2">{i.instrumento}</td>
                  <td className="px-4 py-2 text-ink-2">{i.acreedor}</td>
                  <td className="px-4 py-2 text-ink-2">{i.moneda}</td>
                  <td className="px-4 py-2 text-right">{usdM(i.usd)}</td>
                  <td className="px-4 py-2 text-ink-2">{i.tasa || "—"}</td>
                  <td className="px-4 py-2 text-ink-2">{i.vencimiento ? i.vencimiento.slice(0, 7) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-ink-muted">
          Fuente:{" "}
          <a href={FUENTE} className="underline hover:text-ink">
            Ministerio de Hacienda y Finanzas de Mendoza, tablero de deuda
          </a>
          . Datos crudos y metodología en{" "}
          <Link to="/datos/$fuente" params={{ fuente: "hacienda-deuda-stock" }} className="underline hover:text-ink">
            Datos › Deuda
          </Link>
          .
        </p>
      </Section>
    </div>
  );
}
