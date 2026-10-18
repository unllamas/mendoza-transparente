import { buttonClassName } from "@mt/ui/components/base/buttons/button";
import { cardVariants, listRowVariants, listVariants, tileVariants } from "@mt/ui/components/card";
import { SectionTitle } from "@mt/ui/components/section";
import { Skeleton, SkeletonText } from "@mt/ui/components/skeleton";
import { cx } from "@mt/ui/lib/cx";
import {
  type RemixiconComponentType,
  RiArrowRightLine,
  RiArrowRightSLine,
  RiBankLine,
  RiBookOpenLine,
  RiCoinsLine,
  RiExternalLinkLine,
  RiEyeOffLine,
  RiFileTextLine,
  RiGroupLine,
  RiLayoutGridLine,
  RiLineChartLine,
  RiMapLine,
  RiQuestionLine,
  RiScales3Line,
  RiShoppingCartLine,
  RiSparklingLine,
  RiTeamLine,
} from "@remixicon/react";
import { Await, getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { track } from "@/analytics.ts";
import { MapaMendoza } from "@/charts/mapa.tsx";
import { Sparkline } from "@/charts/sparkline.tsx";
import { CountUp } from "@/components/count-up.tsx";
import { DepartmentPicker, EcosystemMap, HeroQuestions, ReadingRules, StartingQuestions, WhatsNew } from "@/components/home-guide.tsx";
import { LandscapePhoto } from "@/components/landscape-photo.tsx";
import { SearchTrigger } from "@/components/search-dialog.tsx";
import { formatDate, formatNumber } from "@/lib.ts";
import { slug } from "@/slug.ts";
import type { NoPublicado, SourceMeta } from "@/types.ts";

const route = getRouteApi("/");

const decimal = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });
const entero = (v: number) => formatNumber(Math.round(v));
const pesos = (v: number) => `$ ${entero(v)}`;
/** Cifras de miles de millones, en millones: "$ 965.709 M". */
const millones = (v: number) => `$ ${entero(v / 1e6)}`;

export function HomePage() {
  const { sources, home, mapa, noPublicado, guide } = route.useLoaderData();
  const navigate = useNavigate();
  const { deuda, coparticipacion, empleo, poblacion, compras, boletin, inflacion, dolar } = home;
  const fuente = (id: string) => sources.sources.find((s) => s.id === id);

  return (
    <>
      {/*
        Hero: the whole first screen on phones (82% on desktop), full width and under the transparent header
        (-mt-14 = the header height; the layout gives the home page no padding). Search and department side by
        side with the same weight, and three questions as shortcuts. The photo closes it at the bottom.
      */}
      <section className="-mt-14 flex min-h-svh flex-col sm:min-h-[82svh]">
        <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center-safe gap-6 px-4 pt-24 pb-10 text-center sm:px-5">
          <div className="flex flex-col items-center gap-3 sm:gap-4">
            <p className="flex items-center gap-2 text-body-medium text-text-secondary">
              <span className="size-1.5 shrink-0 rounded-full bg-highlight" aria-hidden />
              {formatNumber(sources.records)} registros de {sources.sourcesWithData} fuentes oficiales
            </p>
            <h1 className="text-display-4-semibold tracking-tight text-balance sm:text-display-2-semibold">
              Mendoza, con los números sobre la mesa.
            </h1>
            <p className="max-w-xl text-body-regular text-text-secondary text-pretty sm:text-title-3-regular">
              En qué se gasta la plata, quién decide y qué falta publicar, con la fuente de cada número.
            </p>
          </div>
          <div className="flex w-full max-w-2xl flex-col gap-3 text-left sm:flex-row">
            <div className="min-w-0 flex-1">
              <SearchTrigger />
            </div>
            <DepartmentPicker className="w-full sm:w-60 sm:shrink-0" />
          </div>
          <HeroQuestions />
        </div>
        <LandscapePhoto
          id="cordon-del-plata"
          flush={false}
          fade={false}
          className="-mt-16 h-[26svh] mask-t-from-55% mask-b-from-80% sm:h-[32svh]"
        />
      </section>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-14 px-4 pt-6 pb-8 sm:gap-20 sm:px-5 sm:pt-8 sm:pb-10">
        {guide && (
          <section className="flex flex-col gap-5">
            <Encabezado id="preguntas" icon={RiQuestionLine} titulo="Empezá por una pregunta" />
            <StartingQuestions
              guide={guide}
              oneOfferEvery={compras ? Math.round(100 / compras.pctUnaOferta) : null}
              purchases={compras ? { total: `${millones(compras.totalAdjudicado)} M`, suppliers: compras.proveedores } : null}
            />
          </section>
        )}

        {/* Señales: lo que más interesa desde el menú, ahora arriba */}
        {compras && (
          <section className="flex flex-col gap-6">
            <Encabezado
              id="para-mirar"
              icon={RiScales3Line}
              titulo="Para mirar de cerca"
              bajada="Patrones en los datos oficiales que merecen una explicación. No son acusaciones."
            />
            <div className="grid gap-3 md:grid-cols-3">
              <Senal valor={`${Math.round(compras.pctDirectas)} %`} texto="de las compras se hicieron sin licitación" />
              <Senal valor={`1 de cada ${Math.round(100 / compras.pctUnaOferta)}`} texto="compras tuvo un solo oferente" />
              {deuda && (
                <Senal
                  valor={`US$ ${entero(deuda.maximo.usd)} M`}
                  texto={`fue el pico de la deuda provincial, en ${deuda.maximo.fecha.slice(0, 4)}`}
                />
              )}
            </div>
            <Link
              to="/senales"
              data-track="home.signals.open"
              className={buttonClassName({ variant: "primary", className: "w-full sm:w-fit" })}
            >
              Ver todas las señales y sus casos <RiArrowRightLine className="size-5" aria-hidden />
            </Link>
          </section>
        )}

        {guide && guide.news.length > 0 && (
          <section className="flex flex-col gap-6">
            <Encabezado
              id="lo-nuevo"
              icon={RiSparklingLine}
              titulo="Lo nuevo"
              bajada="Leyes, nombramientos y datos de las últimas semanas."
            />
            <WhatsNew guide={{ ...guide, news: guide.news.slice(0, 5) }} />
          </section>
        )}

        {/* Mapa: el mismo interés que «¿Dónde vivís?», ahora antes de las cifras */}
        {coparticipacion && mapa && (
          <section className="flex flex-col gap-6">
            <Encabezado
              id="tu-departamento"
              icon={RiMapLine}
              titulo="Tu departamento"
              bajada={`Cuánto recibió cada municipio por habitante en ${coparticipacion.anio}.`}
            />
            <div>
              <MapaMendoza
                mapa={mapa}
                valores={coparticipacion.porMunicipio}
                formatValue={pesos}
                seleccionado={null}
                onSelect={(m) => {
                  if (!m) return;
                  track("home.map_department.open", { municipality: slug(m) });
                  void navigate({ to: "/municipios/$slug", params: { slug: slug(m) } });
                }}
                leyenda={`Pesos por habitante (de ${coparticipacion.referencia})`}
              />
            </div>
          </section>
        )}

        {/* Las cifras principales */}
        <section className="flex flex-col gap-6">
          <Encabezado id="numeros" titulo="Mendoza en números" bajada="Cada cifra lleva a su evolución y su fuente." />
          {/* En el celular, una fila por cifra (la evolución y la fuente están en su página) */}
          <ul className={cx(listVariants(), "sm:hidden")}>
            {deuda && <FigureRow id="deuda" icon={RiBankLine} title="Deuda" value={`US$ ${entero(deuda.totalUsd)}`} unit="M" to="/deuda" />}
            {coparticipacion && (
              <FigureRow
                id="coparticipacion"
                icon={RiCoinsLine}
                title="Coparticipación"
                value={millones(coparticipacion.totalReal)}
                unit="M"
                to="/coparticipacion"
              />
            )}
            {empleo && (
              <FigureRow
                id="empleo-publico"
                icon={RiTeamLine}
                title="Empleo público"
                value={decimal.format(empleo.cadaMil)}
                unit="cada mil"
                to="/empleo-publico"
              />
            )}
            {compras && (
              <FigureRow
                id="compras-ocds"
                icon={RiShoppingCartLine}
                title="Compras"
                value={millones(compras.totalAdjudicado)}
                unit="M"
                to="/datos/$fuente"
                params={{ fuente: "compras-ocds" }}
              />
            )}
            {poblacion && (
              <FigureRow id="poblacion" icon={RiGroupLine} title="Población" value={entero(poblacion.actual)} unit="hab." to="/poblacion" />
            )}
            {boletin && (
              <FigureRow
                id="boletin-oficial"
                icon={RiFileTextLine}
                title="Boletín"
                value={entero(boletin.normas)}
                unit="normas"
                to="/datos/$fuente"
                params={{ fuente: "boletin-oficial" }}
              />
            )}
          </ul>
          <div className="hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3">
            {deuda && (
              <Cifra
                fuente={fuente("hacienda-deuda-stock")}
                to="/deuda"
                icon={RiBankLine}
                titulo="Deuda pública"
                valor={<CountUp value={deuda.totalUsd} format={(v) => `US$ ${entero(v)}`} />}
                unidad="millones"
                detalle={`US$ ${entero(deuda.porHabitanteUsd)} por habitante.`}
                serie={deuda.serie}
              />
            )}
            {coparticipacion && (
              <Cifra
                fuente={fuente("hacienda-participacion-municipal")}
                to="/coparticipacion"
                icon={RiCoinsLine}
                titulo={`Coparticipación ${coparticipacion.anio}`}
                valor={<CountUp value={coparticipacion.totalReal} format={millones} />}
                unidad="millones"
                detalle={`A los 18 municipios, en pesos de ${coparticipacion.referencia}.`}
                serie={coparticipacion.serie}
              />
            )}
            {empleo && (
              <Cifra
                fuente={fuente("dnap-ocupacion")}
                to="/empleo-publico"
                icon={RiTeamLine}
                titulo="Empleo público"
                valor={<CountUp value={empleo.cadaMil} format={(v) => decimal.format(v)} />}
                unidad="cada mil hab."
                detalle={`Empleados provinciales. El promedio del país: ${decimal.format(empleo.promedioPais)}.`}
                serie={empleo.serie}
              />
            )}
            {compras && (
              <Cifra
                fuente={fuente("compras-ocds")}
                to="/datos/$fuente"
                params={{ fuente: "compras-ocds" }}
                icon={RiShoppingCartLine}
                titulo="Compras del Estado"
                valor={<CountUp value={compras.totalAdjudicado} format={millones} />}
                unidad="millones"
                detalle={`A ${formatNumber(compras.proveedores)} proveedores, ${compras.desde.slice(0, 4)}–${compras.hasta.slice(0, 4)}. Montos nominales.`}
                serie={compras.serie}
              />
            )}
            {poblacion && (
              <Cifra
                fuente={fuente("poblacion")}
                to="/poblacion"
                icon={RiGroupLine}
                titulo={`Población ${poblacion.anio}`}
                valor={<CountUp value={poblacion.actual} format={entero} />}
                unidad="hab."
                detalle={`${decimal.format(poblacion.variacionCensos)} % más que en el censo 2010.`}
                serie={poblacion.serie}
              />
            )}
            {boletin && (
              <Cifra
                fuente={fuente("boletin-oficial")}
                to="/datos/$fuente"
                params={{ fuente: "boletin-oficial" }}
                icon={RiFileTextLine}
                titulo="Boletín Oficial"
                valor={<CountUp value={boletin.normas} format={entero} />}
                unidad="normas"
                detalle={`${formatNumber(boletin.designaciones)} designaciones desde el ${formatDate(boletin.desde)}.`}
              />
            )}
          </div>

          {(inflacion || dolar) && (
            <div className="grid grid-cols-2 gap-3">
              {inflacion && (
                <Indicador
                  id="inflacion"
                  icon={RiLineChartLine}
                  titulo="Inflación"
                  valor={`${decimal.format(inflacion.mensual)} %`}
                  unidad="mensual"
                  detalle={`${decimal.format(inflacion.interanual)} % en 12 meses`}
                  periodo={`Cuyo, ${inflacion.periodo}`}
                />
              )}
              {dolar && (
                <Indicador id="dolar" icon={RiCoinsLine} titulo="Dólar oficial" valor={pesos(dolar.oficial)} periodo={dolar.periodo} />
              )}
            </div>
          )}
        </section>

        {/* Lo que no se publica: tercera capa, llega después y mientras tanto guarda su lugar */}
        <Await promise={noPublicado} fallback={<MissingDataSkeleton />}>
          {(items) => <MissingData items={items} />}
        </Await>

        {guide && (
          <section className="flex flex-col gap-6">
            <Encabezado
              id="temas"
              icon={RiLayoutGridLine}
              titulo="Todo lo que hay"
              bajada={`${formatNumber(guide.counts.records)} registros, en cuatro preguntas.`}
            />
            <EcosystemMap guide={guide} />
          </section>
        )}

        <section className="flex flex-col gap-6">
          <Encabezado
            id="como-leer"
            icon={RiBookOpenLine}
            titulo="Cómo leer estos datos"
            bajada="Cuatro reglas antes de sacar conclusiones."
          />
          <ReadingRules />
        </section>
      </div>
    </>
  );
}

/** «Lo que el Estado no publica»: the first four, with a link to the full list. */
function MissingData({ items }: { items: NoPublicado[] }) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-6">
      <Encabezado
        id="no-publicado"
        icon={RiEyeOffLine}
        titulo="Lo que el Estado no publica"
        bajada={`${items.length} datos que deberían ser públicos y no están. Podés pedirlos vos.`}
      />
      <ul className={listVariants()}>
        {items.slice(0, 4).map((item) => (
          <li key={item.id}>
            <Link
              to="/no-publicado"
              search={{ dato: item.id } as never}
              data-track="home.missing_data.open"
              data-track-item={item.id}
              className={cx(listRowVariants(), "text-body-regular")}
            >
              <RiEyeOffLine className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium">{item.titulo}</span>
                <span className="text-text-tertiary">{item.organismo}</span>
              </span>
              <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/no-publicado" className={buttonClassName({ variant: "secondary", className: "w-full sm:w-fit" })}>
        Ver los {items.length} y cómo pedirlos <RiArrowRightLine className="size-5" aria-hidden />
      </Link>
    </section>
  );
}

/** Same height as `MissingData` while the list loads: heading, four two-line rows and the button. */
function MissingDataSkeleton() {
  return (
    <section aria-hidden className="flex flex-col gap-6">
      <div className="flex max-w-2xl flex-col gap-1.5">
        <SkeletonText className="w-3/5 text-title-1-semibold" />
        <SkeletonText className="w-full" />
        <SkeletonText className="w-2/3" />
        <SkeletonText className="w-1/3 sm:hidden" />
      </div>
      {/* Measured: the four rows wrap to more lines on a phone. */}
      <Skeleton className="h-[21.75rem] rounded-xl sm:h-[16.75rem]" />
      <Skeleton className="h-11 w-full sm:w-64" />
    </section>
  );
}

function Encabezado({ id, titulo, bajada, icon: Icon }: { id: string; titulo: string; bajada?: string; icon?: RemixiconComponentType }) {
  return (
    <div id={id} className="flex max-w-2xl scroll-mt-20 flex-col gap-1.5">
      <SectionTitle id={id} className="text-title-1-semibold">
        <span className="flex items-center gap-2">
          {Icon && <Icon className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />}
          {titulo}
        </span>
      </SectionTitle>
      {bajada && <p className="text-text-secondary text-pretty">{bajada}</p>}
    </div>
  );
}

type CifraProps = {
  icon: RemixiconComponentType;
  titulo: string;
  valor: ReactNode;
  /** Unidad chica al lado de la cifra ("millones", "hab."), para que el número no se corte. */
  unidad?: string;
  fuente?: SourceMeta;
  detalle: string;
  serie?: number[];
} & (
  | { to: "/deuda" | "/coparticipacion" | "/empleo-publico" | "/poblacion"; params?: never }
  | { to: "/datos/$fuente"; params: { fuente: string } }
);

/** Cifra principal clickeable: lleva borde porque abre su página. */
function Cifra({ icon: Icon, titulo, valor, unidad, detalle, serie, fuente, to, params }: CifraProps) {
  // La tarjeta entera abre su página; el enlace a la fuente oficial queda por encima y abre el sitio del organismo.
  const linkClass = "after:absolute after:inset-0 after:rounded-xl";
  const tituloLink =
    to === "/datos/$fuente" ? (
      <Link to={to} params={params} data-track="home.figure.open" data-track-figure={params.fuente} className={linkClass}>
        {titulo}
      </Link>
    ) : (
      <Link to={to} data-track="home.figure.open" data-track-figure={to.slice(1)} className={linkClass}>
        {titulo}
      </Link>
    );
  return (
    <div className={cx(cardVariants({ size: "lg" }), "relative flex min-w-0 flex-col gap-4")}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-body-regular text-text-secondary">
          <Icon className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
          <span className="truncate">{tituloLink}</span>
        </span>
        <RiArrowRightSLine className="size-5 shrink-0 text-text-link transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>
      <div className="flex items-baseline gap-2 whitespace-nowrap">
        <span className="text-display-4-semibold tracking-tight sm:text-display-3-semibold">{valor}</span>
        {unidad && <span className="text-body-regular text-text-tertiary">{unidad}</span>}
      </div>
      {serie && <Sparkline values={serie} width={320} className="w-full" />}
      <p className="text-body-regular text-text-tertiary text-pretty">{detalle}</p>
      {fuente?.url && (
        <div className="mt-auto border-t border-separator-border pt-3">
          <a
            href={fuente.url}
            target="_blank"
            rel="noreferrer"
            className="relative z-10 inline-flex max-w-full items-center gap-1 text-caption-1-regular text-text-tertiary hover:text-text-link"
          >
            <RiBankLine className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">Fuente: {fuente.organismo || fuente.nombre}</span>
            <RiExternalLinkLine className="size-3 shrink-0" aria-hidden />
          </a>
        </div>
      )}
    </div>
  );
}

/** A figure and one sentence: the nuance and the cases live in /senales. */
function Senal({ valor, texto }: { valor: string; texto: string }) {
  return (
    <div className={cx(tileVariants({ size: "lg" }), "flex flex-col gap-2")}>
      <span className="text-display-4-semibold tracking-tight whitespace-nowrap tabular-nums">{valor}</span>
      <span className="text-title-3-medium text-balance">{texto}</span>
    </div>
  );
}

/** Índice del mes (inflación, dólar): media fila cada uno, con la cifra en grande. */
function Indicador({
  id,
  icon: Icon,
  titulo,
  valor,
  unidad,
  detalle,
  periodo,
}: {
  id: string;
  icon: RemixiconComponentType;
  titulo: string;
  valor: string;
  unidad?: string;
  detalle?: string;
  periodo: string;
}) {
  return (
    <Link
      to="/datos/$fuente"
      params={{ fuente: "indices" }}
      data-track="home.figure.open"
      data-track-figure={id}
      className={cx(cardVariants(), "flex min-w-0 flex-col gap-2")}
    >
      <span className="flex items-center gap-2 text-body-regular text-text-secondary">
        <Icon className="hidden size-4 shrink-0 text-foreground-icon-secondary sm:block" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{titulo}</span>
        <RiArrowRightSLine className="size-4 shrink-0 text-text-link" aria-hidden />
      </span>
      <span className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="text-title-1-semibold tracking-tight tabular-nums">{valor}</span>
        {unidad && <span className="text-body-regular text-text-tertiary">{unidad}</span>}
      </span>
      <span className="flex flex-col text-caption-1-regular text-text-tertiary tabular-nums">
        {detalle && <span className="text-pretty">{detalle}</span>}
        <span className="truncate">{periodo}</span>
      </span>
    </Link>
  );
}

type FigureLink =
  | { to: "/deuda" | "/coparticipacion" | "/empleo-publico" | "/poblacion"; params?: never }
  | { to: "/datos/$fuente"; params: { fuente: string } };

/** Cifra en una fila, para el celular: la evolución y la fuente están en su página. */
function FigureRow({
  id,
  icon: Icon,
  title,
  value,
  unit,
  ...link
}: { id: string; icon: RemixiconComponentType; title: string; value: string; unit: string } & FigureLink) {
  return (
    <li>
      <Link {...link} data-track="home.figure.open" data-track-figure={id} className={listRowVariants()}>
        <Icon className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-body-regular text-text-secondary">{title}</span>
        <span className="flex items-baseline gap-1 whitespace-nowrap">
          <span className="font-semibold tabular-nums">{value}</span>
          <span className="text-caption-1-regular text-text-tertiary">{unit}</span>
        </span>
        <RiArrowRightSLine className="size-4 shrink-0 text-text-link" aria-hidden />
      </Link>
    </li>
  );
}
