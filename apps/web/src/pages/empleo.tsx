import { tileVariants } from "@mt/ui/components/card";
import { PageHeader, Section } from "@mt/ui/components/section";
import { StatTile } from "@mt/ui/components/stat-tile";
import { cx } from "@mt/ui/lib/cx";
import { RiBriefcase4Line, RiTeamLine, RiTrophyLine } from "@remixicon/react";
import { getRouteApi } from "@tanstack/react-router";
import { BarList } from "@/charts/bar-list.tsx";
import { LineChart } from "@/charts/line-chart.tsx";
import { FuentesOficiales } from "@/components/official-sources.tsx";
import { ShareButton } from "@/components/share-button.tsx";
import { TrackedSegmented } from "@/components/tracked-segmented.tsx";
import { GOBIERNOS } from "@/gobiernos.ts";
import { formatNumber } from "@/lib.ts";
import { useUrlOption } from "@/url-state.ts";

const route = getRouteApi("/empleo-publico");

type Periodo = "4" | "8" | "todo";
const PERIODOS: { value: Periodo; label: string }[] = [
  { value: "4", label: "Últimos 4 gobiernos" },
  { value: "8", label: "Últimos 8" },
  { value: "todo", label: "Desde 1987" },
];

const decimal = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

export function EmpleoPage() {
  const empleo = route.useLoaderData();
  const pico = empleo.serie.reduce((max, p) => (p.cadaMil > max.cadaMil ? p : max));
  const [periodo, setPeriodo] = useUrlOption<Periodo>("periodo", ["4", "8", "todo"], "4");
  const gobiernos = periodo === "todo" ? GOBIERNOS : GOBIERNOS.slice(-Number(periodo));
  const desde = Number(gobiernos[0]!.desde.slice(0, 4));
  const serie = empleo.serie.filter((p) => p.anio >= desde);

  return (
    <div className="flex flex-col gap-12">
      <PageHeader action={<ShareButton />} icon={RiTeamLine} topic="Empleo público" title="¿Cuántos empleados públicos tiene Mendoza?">
        Personal ocupado en la administración pública provincial, comparado con la población. Medirlo cada mil habitantes permite comparar
        provincias de distinto tamaño.
      </PageHeader>
      <div className="grid gap-3 md:grid-cols-3">
        <StatTile
          icon={RiTeamLine}
          label="Empleados cada mil habitantes"
          value={decimal.format(empleo.cadaMilMendoza)}
          note={`Promedio de las provincias: ${decimal.format(empleo.promedioPais)} · ${empleo.anio}`}
        />
        <StatTile
          icon={RiTrophyLine}
          label="Puesto entre 24 jurisdicciones"
          value={`${empleo.posicion}.º`}
          note="Ordenadas de menos a más empleados por habitante"
        />
        <StatTile
          icon={RiBriefcase4Line}
          label="Planta ocupada"
          value={formatNumber(Math.round(empleo.plantaMendoza))}
          note={`Cargos, ${empleo.anio}`}
        />
      </div>

      <Section id="provincias" title={`Todas las provincias, ${empleo.anio}`}>
        <BarList
          items={empleo.ranking.map((r) => ({
            nombre: r.provincia,
            valor: r.cadaMil,
            destacado: r.provincia === "Mendoza",
          }))}
          formatValue={(v) => decimal.format(v)}
        />
        <p className="text-body-regular text-text-tertiary">
          Empleados públicos provinciales cada mil habitantes. No incluye municipios ni Nación.
        </p>
      </Section>

      <Section id="evolucion" title="Evolución en Mendoza, empleados cada mil habitantes">
        <TrackedSegmented label="Período" options={PERIODOS} value={periodo} onChange={setPeriodo} />
        <div className={cx(tileVariants())}>
          <LineChart
            data={serie.map((p) => ({ fecha: `${p.anio}-01-01`, valor: p.cadaMil }))}
            bands={gobiernos.map((g) => ({ desde: g.desde, hasta: g.hasta, label: g.nombre }))}
            formatValue={(v) => `${decimal.format(v)} cada mil hab.`}
            formatAxis={(v) => decimal.format(v)}
            formatDate={(f) => f.slice(0, 4)}
            ariaLabel="Empleados públicos provinciales cada mil habitantes en Mendoza, por año"
          />
        </div>
        <p className="text-body-regular text-text-tertiary text-pretty">
          Máximo de la serie: {decimal.format(pico.cadaMil)} en {pico.anio}. Las franjas marcan cada gobernación.
        </p>
      </Section>

      <FuentesOficiales ids={["dnap-ocupacion"]} />
    </div>
  );
}
