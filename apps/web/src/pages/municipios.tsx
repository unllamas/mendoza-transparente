import { cn } from "@mt/ui/lib/utils";
import { cardVariants } from "@mt/ui/components/card";
import { Alert } from "@mt/ui/components/alert";
import { PersonAvatar } from "@mt/ui/components/avatar";
import { PageHeader, Section } from "@mt/ui/components/section";
import { StatTile } from "@mt/ui/components/stat-tile";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { Briefcase, ChevronRight, Coins, MapPin, Users, Vote } from "lucide-react";
import { useMemo } from "react";

import { useUrlOption } from "../url-state.ts";
import { ColumnChart } from "../charts/column-chart.tsx";
import { MapaMendoza, MunicipalityLocator } from "../charts/mapa.tsx";
import { FuentesOficiales } from "../fuente.tsx";
import { formatDate, formatNumber } from "../lib.ts";
import { slug } from "../slug.ts";
import type { MunicipioPagina } from "../types.ts";
import { Migas, Segmented } from "./components.tsx";

const SOURCES = ["hacienda-participacion-municipal", "poblacion", "autoridades", "legislatura", "municipios-personal"];
const pesos = (v: number) => `$ ${formatNumber(Math.round(v))}`;
const listApi = getRouteApi("/municipios");
/** Entry of data/curado/no-publicado.yaml that explains why each municipality has no staff data. */
const MISSING_STAFF: Record<string, string> = {
  "San Martín": "municipios-sin-datos",
  Lavalle: "municipios-sin-datos",
  "Godoy Cruz": "personal-godoy-cruz-las-heras",
  "Las Heras": "personal-godoy-cruz-las-heras",
};
const detailApi = getRouteApi("/municipios/$slug");

type Metric = "poblacion" | "coparticipacion" | "personal";
const METRICS: { value: Metric; label: string }[] = [
  { value: "poblacion", label: "Habitantes" },
  { value: "coparticipacion", label: "Coparticipación por habitante" },
  { value: "personal", label: "Personal cada 1.000 habitantes" },
];
/** Value of each metric; undefined when the municipality has no data (grey on the map, last in the list). */
const metricValue = (m: MunicipioPagina, metric: Metric): number | undefined =>
  metric === "poblacion" ? m.poblacion.actual : metric === "coparticipacion" ? m.coparticipacion?.perCapita : m.staff?.perThousand;
const perThousand = (v: number) => formatNumber(Math.round(v * 10) / 10);
const metricFormat = (metric: Metric) =>
  metric === "poblacion" ? (v: number) => `${formatNumber(v)} hab.` : metric === "coparticipacion" ? pesos : (v: number) => `${perThousand(v)} cada 1.000 hab.`;
const METRIC_UNIT: Record<Metric, string> = { poblacion: "habitantes", coparticipacion: "por habitante", personal: "cada 1.000 hab." };

export function MunicipiosPage() {
  const { municipios, mapa } = listApi.useLoaderData();
  const navigate = useNavigate();
  const [metric, setMetric] = useUrlOption<Metric>("ver", ["poblacion", "coparticipacion", "personal"], "poblacion");
  const sorted = useMemo(() => [...municipios].sort((a, b) => (metricValue(b, metric) ?? -1) - (metricValue(a, metric) ?? -1)), [municipios, metric]);
  const values = Object.fromEntries(municipios.flatMap((m) => (metricValue(m, metric) === undefined ? [] : [[m.nombre, metricValue(m, metric)!]])));
  const anio = municipios.find((m) => m.coparticipacion)?.coparticipacion;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader icon={MapPin} topic="Municipios" title="Los 18 municipios de Mendoza">
        Quién gobierna cada uno, cuántos habitantes tiene, cuánta coparticipación recibe y cuánto personal tiene.
      </PageHeader>
      <Segmented label="Ver en el mapa" options={METRICS} value={metric} onChange={setMetric} />

      <div className="grid gap-8 lg:grid-cols-[2fr_3fr] lg:items-start">
        {mapa && (
          <div className="lg:sticky lg:top-20">
            <MapaMendoza
              mapa={mapa}
              valores={values}
              formatValue={metricFormat(metric)}
              seleccionado={null}
              onSelect={(m) => m && navigate({ to: "/municipios/$slug", params: { slug: slug(m) } })}
              leyenda={
                metric === "poblacion"
                  ? "Habitantes estimados"
                  : metric === "coparticipacion"
                    ? `Por habitante, ${anio?.anio ?? ""} (pesos de ${anio?.referencia ?? ""})`
                    : "Cargos de planta y contratos cada 1.000 habitantes (gris: no lo publica)"
              }
            />
          </div>
        )}

        <ol className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl bg-tile">
          {sorted.map((m, i) => (
            <li key={m.slug}>
              <Link to="/municipios/$slug" params={{ slug: m.slug }} className="group flex items-center gap-3 px-4 py-3 hover:bg-grid/50 sm:gap-4 sm:px-5">
                <span className="w-5 shrink-0 text-right text-sm text-ink-muted tabular-nums">{i + 1}</span>
                <PersonAvatar name={m.intendente?.nombre ?? m.nombre} photo={m.intendente?.foto} className="size-10 text-xs" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium group-hover:text-link">{m.nombre}</span>
                  <span className="truncate text-sm text-ink-muted">
                    {m.intendente ? m.intendente.nombre : "Intendente sin cargar"}
                    {m.intendente?.partido && ` · ${m.intendente.partido}`}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="font-medium whitespace-nowrap tabular-nums">
                    {(() => {
                      const v = metricValue(m, metric);
                      if (v === undefined) return metric === "personal" ? "No lo publica" : "—";
                      return metric === "poblacion" ? formatNumber(v) : metric === "coparticipacion" ? pesos(v) : perThousand(v);
                    })()}
                  </span>
                  <span className="text-xs whitespace-nowrap text-ink-muted">{metricValue(m, metric) === undefined ? "\u00a0" : METRIC_UNIT[metric]}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-link" aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
      </div>

      <FuentesOficiales ids={SOURCES} />
    </div>
  );
}

export function MunicipioPage() {
  const { municipios, mapa, leyes } = detailApi.useLoaderData();
  const { slug: current } = detailApi.useParams();
  const navigate = useNavigate();
  const m = municipios.find((x) => x.slug === current);
  if (!m) {
    return (
      <div className="flex flex-col gap-4">
        <Migas items={[{ label: "Municipios", to: "/municipios" }, { label: "No encontrado" }]} />
        <h1 className="text-2xl font-semibold tracking-tight">No encontramos ese municipio</h1>
        <Link to="/municipios" className="w-fit text-link hover:underline">
          Ver los 18 municipios ›
        </Link>
      </div>
    );
  }
  const c = m.coparticipacion;
  const i = m.intendente;
  const localLaws = leyes.filter((l) => l.municipios.includes(m.slug));
  const st = m.staff;
  // One column per year (its last published quarter): 30 quarters do not fit on a phone.
  const yearly = st ? [...new Map(st.series.map((s) => [s.cutoff.slice(0, 4), s])).values()] : [];
  return (
    <div className="flex flex-col gap-10">
      <Migas items={[{ label: "Municipios", to: "/municipios" }, { label: m.nombre }]} />
      <PageHeader icon={MapPin} topic="Municipio" title={m.nombre}>
        Quién lo gobierna, cuántos habitantes tiene, cuánta coparticipación recibe y quiénes lo representan en la Legislatura.
      </PageHeader>

      <div className="grid gap-6 md:grid-cols-[2fr_3fr] md:items-start">
        {mapa && (
          <MunicipalityLocator
            mapa={mapa}
            focus={m.nombre}
            onOpen={(name) => navigate({ to: "/municipios/$slug", params: { slug: slug(name) } })}
          />
        )}
        <div className="flex min-w-0 flex-col gap-3">
          {i && (
            <Link
              to="/funcionarios/$role/$slug"
              params={{ role: i.role, slug: i.slug }}
              className={cn(cardVariants(), "flex items-center gap-4")}
            >
              <PersonAvatar name={i.nombre} photo={i.foto} className="size-14 text-base" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm text-ink-muted">Intendente</span>
                <span className="truncate text-lg font-medium group-hover:text-link">{i.nombre}</span>
                <span className="truncate text-sm text-ink-2">{[i.partido, i.mandatoHasta && `hasta ${i.mandatoHasta}`].filter(Boolean).join(" · ")}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-link" aria-hidden />
            </Link>
          )}
          <StatTile icon={Users} label="Habitantes" value={formatNumber(m.poblacion.actual)} note={`Puesto ${m.poblacion.puesto} de 18 en la provincia`} />
          <StatTile
            icon={Coins}
            label="Coparticipación por habitante"
            value={c ? pesos(c.perCapita) : "—"}
            note={c ? `Puesto ${c.puesto} de 18 · ${c.anio}, en pesos de ${c.referencia}` : "Sin datos"}
          />
          <StatTile
            icon={Briefcase}
            label="Cargos y contratos"
            value={st ? formatNumber(st.positions + st.contracts) : "No lo publica"}
            note={st ? `${perThousand(st.perThousand)} cada 1.000 habitantes · puesto ${st.rank} de ${st.withData}` : "No publica su planta de personal"}
          />
          <StatTile icon={Vote} label="Sección electoral" value={m.seccion ?? "—"} note="Define a quiénes eligen sus vecinos en la Legislatura" />
        </div>
      </div>

      {c && c.serie.length > 1 && (
        <Section title={`Coparticipación por habitante, en pesos de ${c.referencia}`}>
          <ColumnChart
            columnas={c.serie.map((s) => ({ etiqueta: String(s.anio), valor: s.perCapita }))}
            formatValue={pesos}
            ariaLabel={`Coparticipación por habitante de ${m.nombre} por año`}
          />
          {m.poblacion.actual < 20000 && (
            <Alert variant="note">Los municipios chicos reciben más por habitante porque parte del reparto es un piso fijo.</Alert>
          )}
          <Link to="/coparticipacion" className="w-fit text-sm text-link hover:underline">
            Comparar con los demás municipios ›
          </Link>
        </Section>
      )}

      <Section title="Personal del municipio">
        {st ? (
          <>
            <p className="-mt-2 text-sm text-ink-muted">
              Cargos de planta y contratos según el anexo de personal que el municipio publica por la Ley de Responsabilidad Fiscal, {st.quarter}. Son cargos, no personas: alguien puede tener más de uno.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Planta permanente" value={formatNumber(st.permanent)} />
              <StatTile label="Planta temporaria" value={formatNumber(st.temporary)} />
              <StatTile label="Contratos" value={formatNumber(st.contracts)} note="De locación, sin cargo" />
              <StatTile label="Cada 1.000 hab." value={perThousand(st.perThousand)} note={`Puesto ${st.rank} de ${st.withData}`} />
            </div>
            {yearly.length > 2 && (
              <ColumnChart
                columnas={yearly.map((s) => ({
                  etiqueta: s.cutoff.slice(0, 4),
                  valor: s.positions + s.contracts,
                  detalle: `${s.label.replace("T", ".º trim.")}: ${formatNumber(s.positions)} de planta y ${formatNumber(s.contracts)} contratos`,
                }))}
                formatValue={formatNumber}
                ariaLabel={`Cargos y contratos de ${m.nombre}, por año`}
              />
            )}
            {st.note && <Alert variant="note">{st.note}</Alert>}
            <a href={st.sourceUrl} target="_blank" rel="noreferrer" className="w-fit text-sm text-link hover:underline" data-track="municipality.staff_source.open">
              Ver el anexo publicado por el municipio ↗
            </a>
          </>
        ) : (
          <Alert variant="warning" title="No publica su planta de personal">
            No encontramos el anexo de personal que exige la Ley de Responsabilidad Fiscal en un formato que se pueda leer.{" "}
            <Link to="/no-publicado" search={{ dato: MISSING_STAFF[m.nombre] ?? undefined } as never} className="text-link hover:underline">
              Ver qué falta y cómo pedirlo
            </Link>
            .
          </Alert>
        )}
      </Section>

      {localLaws.length > 0 && (
        <Section title={`Leyes que tocan a ${m.nombre}`}>
          <p className="-mt-2 text-sm text-ink-muted">Leyes provinciales que hacen algo concreto en el departamento: un terreno, una obra, un convenio.</p>
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl bg-tile">
            {localLaws.map((l) => (
              <li key={l.numero}>
                <Link
                  to="/leyes/$numero"
                  params={{ numero: l.numero }}
                  data-track="municipality.law.open"
                  data-track-law={l.numero}
                  className="group flex min-h-11 items-center gap-4 px-4 py-3 hover:bg-grid/50"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium group-hover:text-link" title={l.titulo}>{l.titulo}</span>
                    <span className="truncate text-sm whitespace-nowrap text-ink-muted">
                      {[`Ley ${l.numero}`, l.fecha && formatDate(l.fecha)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-link" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {m.legisladores.length > 0 && (
        <Section title={`Legisladores provinciales de la ${m.seccion?.toLowerCase() ?? ""} sección`}>
          <p className="-mt-2 text-sm text-ink-muted">Los eligen los vecinos de {m.nombre} y del resto de la sección.</p>
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl bg-tile">
            {m.legisladores.map((l) => (
              <li key={l.id}>
                <Link to="/funcionarios/$role/$slug" params={{ role: l.role, slug: l.slug }} className="group flex items-center gap-4 px-4 py-3 hover:bg-grid/50">
                  <PersonAvatar name={l.nombre} photo={l.foto} className="size-10 text-xs" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium group-hover:text-link">{l.nombre}</span>
                    <span className="truncate text-sm text-ink-muted">{[l.cargo, l.bloque].filter(Boolean).join(" · ")}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-link" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <FuentesOficiales ids={SOURCES} />
    </div>
  );
}
