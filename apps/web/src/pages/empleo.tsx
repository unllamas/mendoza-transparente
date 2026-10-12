import { getRouteApi, Link } from "@tanstack/react-router";

import { BarList } from "../charts/bar-list.tsx";
import { LineChart } from "../charts/line-chart.tsx";
import { GOBIERNOS } from "../gobiernos.ts";
import { formatNumber } from "../lib.ts";
import { Section, StatTile } from "./components.tsx";

const route = getRouteApi("/empleo-publico");

const decimal = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });
const FUENTE =
  "https://www.argentina.gob.ar/economia/sechacienda/coordinacion-fiscal-provincial/ejecucion-presupuestaria-provincial/ocupacion-y";

export function EmpleoPage() {
  const empleo = route.useLoaderData();
  const pico = empleo.serie.reduce((max, p) => (p.cadaMil > max.cadaMil ? p : max));

  return (
    <div className="flex flex-col gap-12">
      <div className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">¿Cuántos empleados públicos tiene Mendoza?</h1>
        <p className="text-ink-2 text-pretty">
          Personal ocupado en la administración pública provincial, comparado con la población. Medirlo cada mil
          habitantes permite comparar provincias de distinto tamaño.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <StatTile
          label="Empleados cada mil habitantes"
          value={decimal.format(empleo.cadaMilMendoza)}
          note={`Promedio de las provincias: ${decimal.format(empleo.promedioPais)} · ${empleo.anio}`}
        />
        <StatTile
          label="Puesto entre 24 jurisdicciones"
          value={`${empleo.posicion}.º`}
          note="Ordenadas de menos a más empleados por habitante"
        />
        <StatTile label="Planta ocupada" value={formatNumber(Math.round(empleo.plantaMendoza))} note={`Cargos, ${empleo.anio}`} />
      </div>

      <Section title={`Todas las provincias, ${empleo.anio}`}>
        <BarList
          items={empleo.ranking.map((r) => ({
            nombre: r.provincia,
            valor: r.cadaMil,
            destacado: r.provincia === "Mendoza",
          }))}
          formatValue={(v) => decimal.format(v)}
        />
        <p className="text-sm text-ink-muted">Empleados públicos provinciales cada mil habitantes. No incluye municipios ni Nación.</p>
      </Section>

      <Section title="Evolución en Mendoza">
        <div className="rounded-xl border border-line bg-surface p-4">
          <LineChart
            data={empleo.serie.map((p) => ({ fecha: `${p.anio}-07-01`, valor: p.cadaMil }))}
            bands={GOBIERNOS.map((g) => ({ desde: g.desde, hasta: g.hasta, label: g.nombre }))}
            formatValue={(v) => decimal.format(v)}
            formatDate={(f) => f.slice(0, 4)}
            ariaLabel="Empleados públicos provinciales cada mil habitantes en Mendoza, por año"
          />
        </div>
        <p className="text-sm text-ink-muted text-pretty">
          Máximo de la serie: {decimal.format(pico.cadaMil)} en {pico.anio}. Las franjas marcan cada gobernación.
        </p>
      </Section>

      <p className="text-sm text-ink-muted">
        Fuente:{" "}
        <a href={FUENTE} className="underline hover:text-ink">
          Dirección Nacional de Asuntos Provinciales, ocupación y salarios
        </a>
        . Datos completos en{" "}
        <Link to="/datos/$fuente" params={{ fuente: "dnap-ocupacion" }} className="underline hover:text-ink">
          Datos › Empleo público
        </Link>
        .
      </p>
    </div>
  );
}
