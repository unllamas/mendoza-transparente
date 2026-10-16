import { Alert } from "@mt/ui/components/alert";
import { PersonAvatar } from "@mt/ui/components/avatar";
import { cardVariants, listRowVariants, listVariants } from "@mt/ui/components/card";
import { PageHeader, Section } from "@mt/ui/components/section";
import { StatTile } from "@mt/ui/components/stat-tile";
import { cx } from "@mt/ui/lib/cx";
import {
  RiArrowRightSLine,
  RiAuctionLine,
  RiBriefcaseLine,
  RiCoinsLine,
  RiFileList3Line,
  RiFileSearchLine,
  RiGroupLine,
  RiMapPinLine,
} from "@remixicon/react";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { formatMoneda } from "@/celdas.ts";
import { ColumnChart } from "@/charts/column-chart.tsx";
import { MapaMendoza, MunicipalityLocator } from "@/charts/mapa.tsx";
import { Breadcrumbs, WithBreadcrumbs } from "@/components/breadcrumbs.tsx";
import { LandscapePhoto } from "@/components/landscape-photo.tsx";
import { MunicipalTransparencySection } from "@/components/municipal-transparency.tsx";
import { FuentesOficiales } from "@/components/official-sources.tsx";
import { TrackedSegmented } from "@/components/tracked-segmented.tsx";
import { formatDate, formatNumber } from "@/lib.ts";
import { DEFAULT_PHOTO, municipalityPhoto } from "@/photos.ts";
import { slug } from "@/slug.ts";
import type { MunicipioPagina } from "@/types.ts";
import { useUrlOption } from "@/url-state.ts";

const SOURCES = ["hacienda-participacion-municipal", "poblacion", "autoridades", "legislatura", "municipios-personal", "etica-publica"];
/** Things the law asks every municipality to publish (components/municipal-transparency.tsx). */
const TRANSPARENCY_TOTAL = 9;
const pesos = (v: number) => `$ ${formatNumber(Math.round(v))}`;
const listApi = getRouteApi("/municipios");
/** Entry of data/curado/no-publicado.yaml that explains why each municipality has no staff data. */
const MISSING_STAFF: Record<string, string> = {
  "Godoy Cruz": "personal-godoy-cruz-las-heras",
};
const detailApi = getRouteApi("/municipios/$slug");

type Metric = "poblacion" | "coparticipacion" | "personal" | "publica";
const METRICS: { value: Metric; label: string }[] = [
  { value: "poblacion", label: "Habitantes" },
  { value: "coparticipacion", label: "Coparticipación por habitante" },
  { value: "personal", label: "Personal cada 1.000 habitantes" },
  { value: "publica", label: "Qué publica" },
];
/** Value of each metric; undefined when the municipality has no data (grey on the map, last in the list). */
const metricValue = (m: MunicipioPagina, metric: Metric): number | undefined =>
  metric === "poblacion"
    ? m.poblacion.actual
    : metric === "coparticipacion"
      ? m.coparticipacion?.perCapita
      : metric === "personal"
        ? m.staff?.perThousand
        : m.transparency?.published;
const perThousand = (v: number) => formatNumber(Math.round(v * 10) / 10);
const metricFormat = (metric: Metric) =>
  metric === "poblacion"
    ? (v: number) => `${formatNumber(v)} hab.`
    : metric === "coparticipacion"
      ? pesos
      : metric === "personal"
        ? (v: number) => `${perThousand(v)} cada 1.000 hab.`
        : (v: number) => `${v} de ${TRANSPARENCY_TOTAL}`;
const METRIC_UNIT: Record<Metric, string> = {
  poblacion: "habitantes",
  coparticipacion: "por habitante",
  personal: "cada 1.000 hab.",
  publica: `de ${TRANSPARENCY_TOTAL} cosas`,
};

/** The list and each municipality share the band's height and place, so going from one to the other moves nothing. */
const LANDSCAPE_HEIGHT = "h-44 sm:h-64";

export function MunicipiosPage() {
  const { municipios, mapa } = listApi.useLoaderData();
  const navigate = useNavigate();
  const [metric, setMetric] = useUrlOption<Metric>("ver", ["poblacion", "coparticipacion", "personal", "publica"], "poblacion");
  const sorted = useMemo(
    () => [...municipios].sort((a, b) => (metricValue(b, metric) ?? -1) - (metricValue(a, metric) ?? -1)),
    [municipios, metric],
  );
  const values = Object.fromEntries(
    municipios.flatMap((m) => (metricValue(m, metric) === undefined ? [] : [[m.nombre, metricValue(m, metric)!]])),
  );
  const anio = municipios.find((m) => m.coparticipacion)?.coparticipacion;

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-6">
        <LandscapePhoto id={DEFAULT_PHOTO} className={LANDSCAPE_HEIGHT} />
        <WithBreadcrumbs items={[{ label: "Municipios" }]}>
          <PageHeader icon={RiMapPinLine} topic="Municipios" title="Los 18 municipios de Mendoza">
            Quién gobierna cada uno, cuántos habitantes tiene, cuánta coparticipación recibe, cuánto personal tiene y qué publica.
          </PageHeader>
        </WithBreadcrumbs>
      </div>
      <TrackedSegmented label="Ver en el mapa" options={METRICS} value={metric} onChange={setMetric} />

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
                    : metric === "personal"
                      ? "Cargos de planta y contratos cada 1.000 habitantes (gris: sin datos)"
                      : `Cuántas de las ${TRANSPARENCY_TOTAL} cosas que piden las leyes publica en su sitio`
              }
            />
          </div>
        )}

        <ol className={listVariants()}>
          {sorted.map((m, i) => (
            <li key={m.slug}>
              <Link to="/municipios/$slug" params={{ slug: m.slug }} className={cx(listRowVariants(), "sm:gap-4 sm:px-5")}>
                <span className="w-5 shrink-0 text-right text-body-regular text-text-tertiary tabular-nums">{i + 1}</span>
                <PersonAvatar
                  name={m.intendente?.nombre ?? m.nombre}
                  photo={m.intendente?.foto}
                  className="size-10 text-caption-1-regular"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium group-hover:text-text-link">{m.nombre}</span>
                  <span className="truncate text-body-regular text-text-tertiary">
                    {m.intendente ? m.intendente.nombre : "Intendente sin cargar"}
                    {m.intendente?.partido && ` · ${m.intendente.partido}`}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="font-medium whitespace-nowrap tabular-nums">
                    {(() => {
                      const v = metricValue(m, metric);
                      if (v === undefined) return metric === "personal" ? "Sin datos" : "—";
                      return metric === "poblacion"
                        ? formatNumber(v)
                        : metric === "coparticipacion"
                          ? pesos(v)
                          : metric === "personal"
                            ? perThousand(v)
                            : String(v);
                    })()}
                  </span>
                  <span className="text-caption-1-regular whitespace-nowrap text-text-tertiary">
                    {metricValue(m, metric) === undefined ? "\u00a0" : METRIC_UNIT[metric]}
                  </span>
                </span>
                <RiArrowRightSLine className="size-4 shrink-0 text-text-link" aria-hidden />
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
        <Breadcrumbs items={[{ label: "Municipios", to: "/municipios" }, { label: "No encontrado" }]} />
        <h1 className="text-title-1-semibold tracking-tight">No encontramos ese municipio</h1>
        <Link to="/municipios" className="w-fit text-text-link hover:underline">
          Ver los 18 municipios ›
        </Link>
      </div>
    );
  }
  const c = m.coparticipacion;
  const i = m.intendente;
  const localLaws = leyes.filter((l) => l.municipios.includes(m.slug));
  const st = m.staff;
  const tr = m.transparency;
  const staffItem = tr?.items.find((x) => x.id === "personal");
  // One column per year (its last published quarter): 30 quarters do not fit on a phone.
  const yearly = st ? [...new Map(st.series.map((s) => [s.cutoff.slice(0, 4), s])).values()] : [];
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-6">
        <LandscapePhoto id={municipalityPhoto(m.slug)} className={LANDSCAPE_HEIGHT} />
        <WithBreadcrumbs items={[{ label: "Municipios", to: "/municipios" }, { label: m.nombre }]}>
          <PageHeader icon={RiMapPinLine} topic="Municipio" title={m.nombre}>
            Quién lo gobierna, qué publica, cuánta coparticipación recibe y quiénes lo representan en la Legislatura.
          </PageHeader>
        </WithBreadcrumbs>
      </div>

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
              className={cx(cardVariants(), "flex items-center gap-4")}
            >
              <PersonAvatar name={i.nombre} photo={i.foto} className="size-14 text-headline-regular" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-body-regular text-text-tertiary">Intendente</span>
                <span className="truncate text-title-3-medium group-hover:text-text-link">{i.nombre}</span>
                <span className="truncate text-body-regular text-text-secondary">
                  {[i.partido, i.mandatoHasta && `hasta ${i.mandatoHasta}`].filter(Boolean).join(" · ")}
                </span>
              </span>
              <RiArrowRightSLine className="size-4 shrink-0 text-text-link" aria-hidden />
            </Link>
          )}
          <StatTile
            icon={RiGroupLine}
            label="Habitantes"
            value={formatNumber(m.poblacion.actual)}
            note={`Puesto ${m.poblacion.puesto} de 18 en la provincia`}
          />
          <StatTile
            icon={RiCoinsLine}
            label="Coparticipación por habitante"
            value={c ? pesos(c.perCapita) : "—"}
            note={c ? `Puesto ${c.puesto} de 18 · ${c.anio}, en pesos de ${c.referencia}` : "Sin datos"}
          />
          <StatTile
            icon={RiBriefcaseLine}
            label="Cargos y contratos"
            value={st ? formatNumber(st.positions + st.contracts) : staffItem?.url ? "—" : "No lo publica"}
            note={
              st
                ? `${perThousand(st.perThousand)} cada 1.000 habitantes · puesto ${st.rank} de ${st.withData}`
                : staffItem?.url
                  ? "Lo publica; todavía no lo sumamos"
                  : "No publica su planta de personal"
            }
          />
          {m.budget && (
            <Link
              to="/municipios/$slug/presupuesto/$anio"
              params={{ slug: m.slug, anio: String(m.budget.year) }}
              className={cx(cardVariants(), "flex flex-col gap-1")}
              data-track="municipality.budget.open"
              data-track-municipality={m.nombre}
            >
              <span className="flex min-w-0 items-center gap-2 text-body-regular text-text-secondary">
                <RiFileList3Line className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
                <span className="truncate">
                  Gastado en {m.budget.year}
                  {m.budget.partial ? ` (hasta ${m.budget.cutoff.split(" ")[0]})` : ""}
                </span>
              </span>
              <span className="truncate text-title-1-semibold tracking-tight whitespace-nowrap sm:text-display-4-semibold">
                {formatMoneda(m.budget.accrued, "ARS")}
              </span>
              <span className="flex items-center justify-between gap-2 text-caption-1-regular text-text-secondary">
                <span className="min-w-0">
                  {m.budget.perCapitaReal && m.budget.reference
                    ? `${pesos(m.budget.perCapitaReal)} por habitante, en pesos de ${m.budget.reference} · en qué se gasta`
                    : "En qué se gasta y de dónde sale la plata"}
                </span>
                <RiArrowRightSLine className="size-4 shrink-0 text-text-link" aria-hidden />
              </span>
            </Link>
          )}
          {tr && (
            <a href="#que-publica" className={cx(cardVariants(), "flex flex-col gap-1")} data-track="municipality.transparency.jump">
              <span className="flex min-w-0 items-center gap-2 text-body-regular text-text-secondary">
                <RiFileSearchLine className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
                <span className="truncate">Qué publica</span>
              </span>
              <span className="truncate text-title-1-semibold tracking-tight whitespace-nowrap sm:text-display-4-semibold">
                {tr.published} de {tr.items.length}
              </span>
              <span className="flex items-center justify-between gap-2 text-caption-1-regular text-text-secondary">
                <span className="min-w-0">
                  {tr.current} al día · puesto {tr.rank} de 18 · revisado el {formatDate(tr.checked)}
                </span>
                <RiArrowRightSLine className="size-4 shrink-0 text-text-link" aria-hidden />
              </span>
            </a>
          )}
          <StatTile
            icon={RiAuctionLine}
            label="Sección electoral"
            value={m.seccion ?? "—"}
            note="Define a quiénes eligen sus vecinos en la Legislatura"
          />
        </div>
      </div>

      {tr && (
        <div id="que-publica" className="scroll-mt-20">
          <MunicipalTransparencySection name={m.nombre} data={tr} />
        </div>
      )}

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
          <Link to="/coparticipacion" className="w-fit text-body-regular text-text-link hover:underline">
            Comparar con los demás municipios ›
          </Link>
        </Section>
      )}

      <Section title="Personal del municipio">
        {st ? (
          <>
            <p className="-mt-2 text-body-regular text-text-tertiary">
              Cargos de planta y contratos según el anexo de personal que el municipio publica por la Ley de Responsabilidad Fiscal,{" "}
              {st.quarter}. Son cargos, no personas: alguien puede tener más de uno.
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
            <a
              href={st.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="w-fit text-body-regular text-text-link hover:underline"
              data-track="municipality.staff_source.open"
            >
              Ver el anexo publicado por el municipio ↗
            </a>
          </>
        ) : staffItem?.url && staffItem.status !== "missing" && staffItem.status !== "unreadable" ? (
          <Alert variant="note" title="Lo publica, todavía no lo sumamos">
            El municipio publica el anexo de personal de la Ley de Responsabilidad Fiscal, pero todavía no lo procesamos para mostrarlo acá.{" "}
            <a
              href={staffItem.url}
              target="_blank"
              rel="noreferrer"
              className="text-text-link hover:underline"
              data-track="municipality.staff_source.open"
            >
              Ver el anexo publicado por el municipio ↗
            </a>
          </Alert>
        ) : (
          <Alert variant="warning" title="No publica su planta de personal">
            No encontramos el anexo de personal que exige la Ley de Responsabilidad Fiscal en un formato que se pueda leer.{" "}
            <Link
              to="/no-publicado"
              search={{ dato: MISSING_STAFF[m.nombre] ?? undefined } as never}
              className="text-text-link hover:underline"
            >
              Ver qué falta y cómo pedirlo
            </Link>
            .
          </Alert>
        )}
      </Section>

      {localLaws.length > 0 && (
        <Section title={`Leyes que tocan a ${m.nombre}`}>
          <p className="-mt-2 text-body-regular text-text-tertiary">
            Leyes provinciales que hacen algo concreto en el departamento: un terreno, una obra, un convenio.
          </p>
          <ul className={listVariants()}>
            {localLaws.map((l) => (
              <li key={l.numero}>
                <Link
                  to="/leyes/$numero"
                  params={{ numero: l.numero }}
                  data-track="municipality.law.open"
                  data-track-law={l.numero}
                  className={listRowVariants()}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium group-hover:text-text-link" title={l.titulo}>
                      {l.titulo}
                    </span>
                    <span className="truncate text-body-regular whitespace-nowrap text-text-tertiary">
                      {[`Ley ${l.numero}`, l.fecha && formatDate(l.fecha)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <RiArrowRightSLine className="size-4 shrink-0 text-text-link" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {m.legisladores.length > 0 && (
        <Section title={`Legisladores provinciales de la ${m.seccion?.toLowerCase() ?? ""} sección`}>
          <p className="-mt-2 text-body-regular text-text-tertiary">Los eligen los vecinos de {m.nombre} y del resto de la sección.</p>
          <ul className={listVariants()}>
            {m.legisladores.map((l) => (
              <li key={l.id}>
                <Link to="/funcionarios/$role/$slug" params={{ role: l.role, slug: l.slug }} className={listRowVariants()}>
                  <PersonAvatar name={l.nombre} photo={l.foto} className="size-10 text-caption-1-regular" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium group-hover:text-text-link">{l.nombre}</span>
                    <span className="truncate text-body-regular text-text-tertiary">{[l.cargo, l.bloque].filter(Boolean).join(" · ")}</span>
                  </span>
                  <RiArrowRightSLine className="size-4 shrink-0 text-text-link" aria-hidden />
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
