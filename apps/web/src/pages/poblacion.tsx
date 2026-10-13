import { Alert } from "@mt/ui/components/alert";
import { Button } from "@mt/ui/components/base/buttons/button";
import { listRowVariants, listVariants, tileVariants } from "@mt/ui/components/card";
import { PageHeader, Section } from "@mt/ui/components/section";
import { StatTile } from "@mt/ui/components/stat-tile";
import { cx } from "@mt/ui/lib/cx";
import { RiArrowRightSLine, RiGroupLine, RiLineChartLine, RiMapPinLine } from "@remixicon/react";
import { getRouteApi, Link } from "@tanstack/react-router";
import { LineChart } from "@/charts/line-chart.tsx";
import { MapaMendoza } from "@/charts/mapa.tsx";
import { FuentesOficiales } from "@/components/official-sources.tsx";
import { TrackedSegmented } from "@/components/tracked-segmented.tsx";
import { formatNumber } from "@/lib.ts";
import { slug } from "@/slug.ts";
import type { PoblacionTema } from "@/types.ts";
import { useUrlOption, useUrlText } from "@/url-state.ts";

const route = getRouteApi("/poblacion");

const pct = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1, signDisplay: "always" });
const porcentaje = (v: number) => `${pct.format(v)} %`;
const personas = (v: number) => formatNumber(Math.round(v));

export function PoblacionPage() {
  const { tema, mapa } = route.useLoaderData();
  const [selSlug, setSelSlug] = useUrlText("departamento");
  const sel = tema.departamentos.find((d) => slug(d.municipio) === selSlug)?.municipio ?? null;
  const setSel = (name: string | null) => setSelSlug(name && slug(name));
  const [medida, setMedida] = useUrlOption<"habitantes" | "crecimiento">("medida", ["habitantes", "crecimiento"], "habitantes");
  const porCrecimiento = [...tema.departamentos].sort((a, b) => b.variacion - a.variacion);
  const ranking = medida === "habitantes" ? [...tema.departamentos].sort((a, b) => b.actual - a.actual) : porCrecimiento;
  const depto = ranking.find((d) => d.municipio === sel);
  const variacionProv = (tema.censo2022 / tema.censo2010 - 1) * 100;

  return (
    <div className="flex flex-col gap-12">
      <PageHeader icon={RiGroupLine} topic="Población" title="¿Cuántos somos en Mendoza?">
        Población de la provincia y de cada departamento según los censos 2010 y 2022, y las proyecciones oficiales de INDEC para los años
        sin censo.
      </PageHeader>
      <FuentesOficiales ids={["poblacion"]} />

      <div className="grid gap-3 md:grid-cols-3">
        <StatTile icon={RiGroupLine} label={`Habitantes en ${tema.anioActual}`} value={personas(tema.actual)} note="Proyección INDEC" />
        <StatTile icon={RiLineChartLine} label="Crecimiento entre censos" value={porcentaje(variacionProv)} note="De 2010 a 2022" />
        <StatTile
          icon={RiMapPinLine}
          label="Creció más"
          value={porCrecimiento[0]!.municipio}
          note={`${porcentaje(porCrecimiento[0]!.variacion)} entre 2010 y 2022`}
        />
      </div>

      <Section title="Habitantes por año">
        <div className={cx(tileVariants())}>
          <LineChart
            data={tema.serie.map((p) => ({ fecha: `${p.anio}-01-01`, valor: p.poblacion }))}
            bands={[
              { desde: `${tema.serie[0]!.anio}-01-01`, hasta: `${tema.anioActual}-12-31`, label: "" },
              { desde: `${tema.anioActual + 1}-01-01`, hasta: null, label: "Proyección" },
            ]}
            formatValue={(v) => `${personas(v)} habitantes`}
            formatAxis={(v) => `${formatNumber(v / 1e6)} M`}
            formatDate={(f) => f.slice(0, 4)}
            ariaLabel="Población de Mendoza por año"
          />
        </div>
        <Alert variant="note">
          Hasta 2021 la proyección parte del Censo 2010 y desde 2022 del Censo 2022, por eso hay un pequeño salto entre esos años.
        </Alert>
      </Section>

      <Section title="Por departamento">
        <TrackedSegmented
          label="Qué mostrar"
          value={medida}
          onChange={setMedida}
          options={[
            { value: "habitantes", label: `Habitantes en ${tema.anioActual}` },
            { value: "crecimiento", label: "Crecimiento 2010–2022" },
          ]}
        />
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <MapaMendoza
            mapa={mapa}
            valores={Object.fromEntries(tema.departamentos.map((d) => [d.municipio, medida === "habitantes" ? d.actual : d.variacion]))}
            formatValue={medida === "habitantes" ? (v) => `${personas(v)} hab.` : porcentaje}
            seleccionado={sel}
            onSelect={setSel}
            leyenda={
              medida === "habitantes"
                ? `Habitantes en ${tema.anioActual} (proyección INDEC)`
                : "Variación de población entre los censos 2010 y 2022"
            }
          />
          {depto ? (
            <Detalle depto={depto} onClose={() => setSel(null)} />
          ) : (
            <ol className={listVariants()}>
              {ranking.map((d, i) => (
                <li key={d.municipio}>
                  <button
                    type="button"
                    onClick={() => setSel(d.municipio)}
                    className={cx(listRowVariants(), "grid grid-cols-[1.5rem_1fr_auto_1rem] text-body-regular")}
                  >
                    <span className="text-text-tertiary tabular-nums">{i + 1}</span>
                    <span>{d.municipio}</span>
                    <span className="flex items-baseline gap-2 tabular-nums">
                      {medida === "habitantes" ? (
                        <>
                          <span className="text-text-secondary">{personas(d.actual)}</span>
                          <span className="w-14 text-right text-caption-1-regular text-text-tertiary">{porcentaje(d.variacion)}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-text-secondary">{porcentaje(d.variacion)}</span>
                          <span className="w-20 text-right text-caption-1-regular text-text-tertiary">{personas(d.actual)}</span>
                        </>
                      )}
                    </span>
                    <RiArrowRightSLine className="size-4 text-text-link" aria-hidden />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Section>

      <p className="text-body-regular text-text-tertiary">
        Fuente: INDEC, censos y proyecciones de población. Datos completos en{" "}
        <Link to="/datos/$fuente" params={{ fuente: "poblacion" }} className="underline hover:text-text-primary">
          Datos › Población
        </Link>
        .
      </p>
    </div>
  );
}

function Detalle({ depto: d, onClose }: { depto: PoblacionTema["departamentos"][number]; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 flex-col gap-0.5">
          <h3 className="truncate text-title-2-semibold tracking-tight">{d.municipio}</h3>
          <Link
            to="/municipios/$slug"
            params={{ slug: slug(d.municipio) }}
            className="text-body-regular whitespace-nowrap text-text-link hover:underline"
          >
            Ver todo sobre {d.municipio} ›
          </Link>
        </span>
        <Button variant="secondary" onClick={onClose}>
          Ver ranking
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Censo 2010" value={personas(d.censo2010)} />
        <StatTile label="Censo 2022" value={personas(d.censo2022)} note={porcentaje(d.variacion)} />
      </div>
      <p className="text-body-regular text-text-secondary">Hoy: {personas(d.actual)} habitantes (proyección INDEC).</p>
      <div className={tileVariants({ size: "sm" })}>
        <LineChart
          data={d.serie.map((p) => ({ fecha: `${p.anio}-01-01`, valor: p.poblacion }))}
          formatValue={(v) => `${personas(v)} hab.`}
          formatAxis={(v) => `${formatNumber(Math.round(v / 1e3))} mil`}
          formatDate={(f) => f.slice(0, 4)}
          height={200}
          ariaLabel={`Población de ${d.municipio} por año`}
        />
      </div>
    </div>
  );
}
