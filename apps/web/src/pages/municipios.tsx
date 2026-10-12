import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Coins, MapPin, Users, Vote } from "lucide-react";
import { useMemo, useState } from "react";

import { ColumnChart } from "../charts/column-chart.tsx";
import { MapaMendoza, MunicipalityLocator } from "../charts/mapa.tsx";
import { FuentesOficiales } from "../fuente.tsx";
import { formatNumber } from "../lib.ts";
import { slug } from "../slug.ts";
import type { MunicipioPagina } from "../types.ts";
import { Aviso, Migas, PageHeader, PersonAvatar, Section, Segmented, StatTile } from "./components.tsx";

const SOURCES = ["hacienda-participacion-municipal", "poblacion", "autoridades", "legislatura"];
const pesos = (v: number) => `$ ${formatNumber(Math.round(v))}`;
const listApi = getRouteApi("/municipios");
const detailApi = getRouteApi("/municipios/$slug");

type Metric = "poblacion" | "coparticipacion";
const METRICS: { value: Metric; label: string }[] = [
  { value: "poblacion", label: "Habitantes" },
  { value: "coparticipacion", label: "Coparticipación por habitante" },
];
const metricValue = (m: MunicipioPagina, metric: Metric) =>
  metric === "poblacion" ? m.poblacion.actual : (m.coparticipacion?.perCapita ?? 0);
const metricFormat = (metric: Metric) => (metric === "poblacion" ? (v: number) => `${formatNumber(v)} hab.` : pesos);

export function MunicipiosPage() {
  const { municipios, mapa } = listApi.useLoaderData();
  const navigate = useNavigate();
  const [metric, setMetric] = useState<Metric>("poblacion");
  const sorted = useMemo(() => [...municipios].sort((a, b) => metricValue(b, metric) - metricValue(a, metric)), [municipios, metric]);
  const values = Object.fromEntries(municipios.map((m) => [m.nombre, metricValue(m, metric)]));
  const anio = municipios.find((m) => m.coparticipacion)?.coparticipacion;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader icon={MapPin} tema="Municipios" titulo="Los 18 municipios de Mendoza">
        Quién gobierna cada uno, cuántos habitantes tiene y cuánta coparticipación recibe por habitante.
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
              leyenda={metric === "poblacion" ? "Habitantes estimados" : `Por habitante, ${anio?.anio ?? ""} (pesos de ${anio?.referencia ?? ""})`}
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
                    {metric === "poblacion" ? formatNumber(m.poblacion.actual) : m.coparticipacion ? pesos(m.coparticipacion.perCapita) : "—"}
                  </span>
                  <span className="text-xs whitespace-nowrap text-ink-muted">{metric === "poblacion" ? "habitantes" : "por habitante"}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-ink-muted group-hover:text-link" aria-hidden />
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
  const { municipios, mapa } = detailApi.useLoaderData();
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
  return (
    <div className="flex flex-col gap-10">
      <Migas items={[{ label: "Municipios", to: "/municipios" }, { label: m.nombre }]} />
      <PageHeader icon={MapPin} tema="Municipio" titulo={m.nombre}>
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
              className="group flex items-center gap-4 rounded-xl border border-line bg-surface p-4 hover:border-link"
            >
              <PersonAvatar name={i.nombre} photo={i.foto} className="size-14 text-base" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm text-ink-muted">Intendente</span>
                <span className="truncate text-lg font-medium group-hover:text-link">{i.nombre}</span>
                <span className="truncate text-sm text-ink-2">{[i.partido, i.mandatoHasta && `hasta ${i.mandatoHasta}`].filter(Boolean).join(" · ")}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-ink-muted group-hover:text-link" aria-hidden />
            </Link>
          )}
          <StatTile icon={Users} label="Habitantes" value={formatNumber(m.poblacion.actual)} note={`Puesto ${m.poblacion.puesto} de 18 en la provincia`} />
          <StatTile
            icon={Coins}
            label="Coparticipación por habitante"
            value={c ? pesos(c.perCapita) : "—"}
            note={c ? `Puesto ${c.puesto} de 18 · ${c.anio}, en pesos de ${c.referencia}` : "Sin datos"}
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
            <Aviso tipo="nota">Los municipios chicos reciben más por habitante porque parte del reparto es un piso fijo.</Aviso>
          )}
          <Link to="/coparticipacion" className="w-fit text-sm text-link hover:underline">
            Comparar con los demás municipios ›
          </Link>
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
                  <ChevronRight className="size-4 shrink-0 text-ink-muted group-hover:text-link" aria-hidden />
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
