import { Alert } from "@mt/ui/components/alert";
import { tileVariants } from "@mt/ui/components/card";
import { PageHeader, Section } from "@mt/ui/components/section";
import { StatTile } from "@mt/ui/components/stat-tile";
import { cx } from "@mt/ui/lib/cx";
import { RiBankLine, RiLineChartLine, RiUserLine } from "@remixicon/react";
import { getRouteApi, Link } from "@tanstack/react-router";

import { BarList } from "@/charts/bar-list.tsx";
import { LineChart } from "@/charts/line-chart.tsx";
import { FuentesOficiales } from "@/components/official-sources.tsx";
import { ShareButton } from "@/components/share-button.tsx";
import { GOBIERNOS } from "@/gobiernos.ts";
import { formatDate, formatNumber } from "@/lib.ts";

const route = getRouteApi("/deuda");

const usdM = (v: number) => `US$ ${formatNumber(Math.round(v))} M`;
const trimestre = (fecha: string) => {
  const [y, m] = fecha.split("-");
  return `${Math.ceil(Number(m) / 3)}.º trim. ${y}`;
};
const mesAnio = (fecha: string) => new Date(`${fecha.slice(0, 7)}-15`).toLocaleDateString("es-AR", { month: "short", year: "numeric" });
const FUENTE = "https://sitios.mendoza.gob.ar/haciendayfinanzas/stock-vigente/";

export function DeudaPage() {
  const deuda = route.useLoaderData();
  const pico = deuda.serie.reduce((max, p) => (p.usd > max.usd ? p : max));

  return (
    <div className="flex flex-col gap-12">
      <PageHeader action={<ShareButton />} icon={RiBankLine} topic="Deuda pública" title="¿Cuánto debe Mendoza?">
        La deuda pública consolidada de la provincia: bonos, préstamos de organismos internacionales y de bancos. Los montos están en
        dólares para poder comparar años con distinta inflación.
      </PageHeader>
      <FuentesOficiales ids={["hacienda-deuda-stock"]} />

      <div className="grid gap-3 md:grid-cols-3">
        <StatTile icon={RiBankLine} label="Deuda consolidada" value={usdM(deuda.totalUsd)} note={`Al ${formatDate(deuda.corte)}`} />
        <StatTile
          icon={RiUserLine}
          label="Por habitante"
          value={`US$ ${formatNumber(Math.round(deuda.porHabitanteUsd))}`}
          note={`Sobre ${formatNumber(deuda.poblacion)} habitantes (proyección INDEC)`}
        />
        <StatTile icon={RiLineChartLine} label="Máximo de la serie" value={usdM(pico.usd)} note={trimestre(pico.fecha)} />
      </div>

      <Section title="Evolución de la deuda, en millones de dólares">
        <div className={cx(tileVariants())}>
          <LineChart
            data={deuda.serie.map((p) => ({ fecha: p.fecha, valor: p.usd }))}
            bands={GOBIERNOS.map((g) => ({ desde: g.desde, hasta: g.hasta, label: g.nombre }))}
            formatValue={usdM}
            formatAxis={(v) => formatNumber(v)}
            formatDate={trimestre}
            ariaLabel="Deuda consolidada de Mendoza en millones de dólares, por trimestre"
          />
        </div>
        <p className="text-body-regular text-text-tertiary text-pretty">
          Deuda consolidada en millones de dólares al cierre de cada trimestre. Las franjas marcan cada gobernación.
        </p>
        <Alert variant="note" title="Cómo leer este gráfico">
          La deuda tomada en pesos baja medida en dólares cuando el peso se devalúa, aunque no se haya pagado. Una caída en el gráfico no
          siempre significa que se pagó deuda.
        </Alert>
      </Section>

      <Section title="Por mandato">
        <div className="grid gap-3 md:grid-cols-3">
          {deuda.mandatos.map((m) => {
            const delta = m.fin.usd - m.inicio.usd;
            return (
              <div key={m.desde} className={cx(tileVariants(), "flex flex-col gap-1")}>
                <span className="text-body-regular text-text-secondary">
                  {m.gobierno} {m.desde.slice(0, 4)}–{m.hasta ? m.hasta.slice(0, 4) : "hoy"}
                </span>
                <span className="text-title-1-semibold tracking-tight tabular-nums">
                  {delta >= 0 ? "+" : "−"}
                  {usdM(Math.abs(delta))}
                </span>
                <span className="text-caption-1-regular text-text-tertiary tabular-nums">
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
          <p className="text-body-regular text-text-tertiary">
            "Pesos ajustados" son deudas en pesos que se actualizan por inflación (CER) o por otro índice.
          </p>
        </Section>
      </div>

      <Section title="Instrumentos vigentes">
        <div className={cx(tileVariants({ size: "sm" }), "overflow-x-auto p-0")}>
          <table className="w-full text-left text-body-regular">
            <thead className="border-b border-separator-border text-text-tertiary">
              <tr>
                <th className="px-4 py-3 font-medium">Instrumento</th>
                <th className="px-4 py-3 font-medium">Acreedor</th>
                <th className="px-4 py-3 font-medium">Moneda</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-medium">Saldo</th>
                <th className="px-4 py-3 font-medium">Tasa</th>
                <th className="px-4 py-3 font-medium">Vence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-separator-border tabular-nums">
              {deuda.instrumentos.map((i) => (
                <tr key={i.instrumento + i.vencimiento}>
                  <td className="px-4 py-2">{i.instrumento}</td>
                  <td className="px-4 py-2 text-text-secondary">{i.acreedor}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-text-secondary">{i.moneda}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">{usdM(i.usd)}</td>
                  <td className="px-4 py-2 text-text-secondary">{i.tasa || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-text-secondary">{i.vencimiento ? mesAnio(i.vencimiento) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-body-regular text-text-tertiary">
          Fuente:{" "}
          <a href={FUENTE} className="underline hover:text-text-primary">
            Ministerio de Hacienda y Finanzas de Mendoza, tablero de deuda
          </a>
          . Datos crudos y metodología en{" "}
          <Link to="/datos/$fuente" params={{ fuente: "hacienda-deuda-stock" }} className="underline hover:text-text-primary">
            Datos › Deuda
          </Link>
          .
        </p>
      </Section>
    </div>
  );
}
