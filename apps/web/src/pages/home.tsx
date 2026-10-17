import { buttonClassName } from "@mt/ui/components/base/buttons/button";
import { cardVariants, listRowVariants, listVariants, tileVariants } from "@mt/ui/components/card";
import { SectionTitle } from "@mt/ui/components/section";
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
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { track } from "@/analytics.ts";
import { MapaMendoza } from "@/charts/mapa.tsx";
import { Sparkline } from "@/charts/sparkline.tsx";
import { CountUp } from "@/components/count-up.tsx";
import { DepartmentPicker, EcosystemMap, ReadingRules, StartingQuestions, WhatsNew } from "@/components/home-guide.tsx";
import { LandscapePhoto } from "@/components/landscape-photo.tsx";
import { SearchTrigger } from "@/components/search-dialog.tsx";
import { formatDate, formatNumber } from "@/lib.ts";
import { slug } from "@/slug.ts";
import type { SourceMeta } from "@/types.ts";

const route = getRouteApi("/");

const decimal = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });
const entero = (v: number) => formatNumber(Math.round(v));
const pesos = (v: number) => `$ ${entero(v)}`;
/** Cifras de miles de millones, en millones: "$ 965.709 M". */
const millones = (v: number) => `$ ${entero(v / 1e6)}`;

export function HomePage() {
  const { index, home, mapa, noPublicado, guide } = route.useLoaderData();
  const navigate = useNavigate();
  const fuentesConDatos = index.sources.filter((s) => index.datasets.some((d) => d.source === s.id)).length;
  const registros = index.datasets.reduce((s, d) => s + d.rowCount, 0);
  const { deuda, coparticipacion, empleo, poblacion, compras, boletin, inflacion, dolar } = home;
  const fuente = (id: string) => index.sources.find((s) => s.id === id);

  return (
    <div className="flex flex-col gap-14 sm:gap-20">
      {/* Portada y preguntas juntas: las preguntas entran en la primera pantalla */}
      <div className="flex flex-col gap-10 sm:gap-12">
        <section className="flex flex-col gap-5 sm:gap-6">
          <LandscapePhoto id="cordon-del-plata" className="h-24 sm:h-32" />
          <div className="flex max-w-3xl flex-col gap-3 sm:gap-4">
            <p className="flex items-center gap-2 text-body-medium text-text-secondary">
              <span className="size-1.5 shrink-0 rounded-full bg-highlight" aria-hidden />
              {formatNumber(registros)} registros de {fuentesConDatos} fuentes oficiales
            </p>
            <h1 className="text-display-4-semibold tracking-tight text-balance sm:text-display-2-semibold">
              Mendoza, con los números sobre la mesa.
            </h1>
            <p className="max-w-2xl text-body-regular text-text-secondary text-pretty sm:text-title-3-regular">
              En qué se gasta la plata, quién decide y qué falta publicar, con la fuente de cada número.
            </p>
          </div>
          <div className="flex max-w-3xl flex-col gap-3">
            <SearchTrigger />
            <DepartmentPicker />
          </div>
        </section>

        {guide && (
          <section className="flex flex-col gap-5">
            <Encabezado id="preguntas" icon={RiQuestionLine} titulo="Empezá por una pregunta" />
            <StartingQuestions guide={guide} oneOfferEvery={compras ? Math.round(100 / compras.pctUnaOferta) : null} />
          </section>
        )}
      </div>

      {/* Señales: lo que más interesa desde el menú, ahora arriba */}
      {compras && (
        <section className="flex flex-col gap-6">
          <Encabezado
            id="para-mirar"
            icon={RiScales3Line}
            titulo="Para mirar de cerca"
            bajada="No son acusaciones: son patrones en los datos oficiales que merecen una explicación."
          />
          <div className="grid gap-3 md:grid-cols-3">
            <Senal
              valor={`${Math.round(compras.pctDirectas)} %`}
              texto="de los procesos de compra fueron contrataciones directas, sin licitación."
              matiz={`Pero representan el ${Math.round(compras.pctMontoDirectas)} % de la plata: muchas son compras chicas.`}
            />
            <Senal
              valor={`1 de cada ${Math.round(100 / compras.pctUnaOferta)}`}
              texto="procesos de compra recibió una sola oferta."
              matiz={`${decimal.format(compras.pctUnaOferta)} % de los procesos con dato de oferentes.`}
            />
            {deuda && (
              <Senal
                valor={`US$ ${entero(deuda.maximo.usd)} M`}
                texto={`fue el máximo de la deuda provincial, en ${deuda.maximo.fecha.slice(0, 4)}.`}
                matiz={`Hoy está en US$ ${entero(deuda.totalUsd)} M. Medida en dólares, la deuda en pesos baja cuando hay devaluación.`}
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
            bajada="Las últimas leyes, nombramientos y datos actualizados."
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
            bajada={`Cuánto recibió cada municipio por habitante en ${coparticipacion.anio}. Tocá uno para ver su detalle.`}
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
        <Encabezado id="numeros" titulo="Mendoza en números" bajada="Tocá cualquier cifra para ver el detalle, la evolución y la fuente." />
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
              detalle={`US$ ${entero(deuda.porHabitanteUsd)} por habitante. Máximo: US$ ${entero(deuda.maximo.usd)} M en ${deuda.maximo.fecha.slice(0, 4)}.`}
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
              detalle={`Repartido a los 18 municipios, en pesos de ${coparticipacion.referencia}. ${coparticipacion.top.municipio} es el que más recibe por habitante.`}
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
              detalle={`Empleados provinciales cada mil habitantes: el ${empleo.posicion}.º más bajo de 24 jurisdicciones. Promedio del país: ${decimal.format(empleo.promedioPais)}.`}
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
              detalle={`Adjudicado en ${formatNumber(compras.procesos)} procesos a ${formatNumber(compras.proveedores)} proveedores, ${compras.desde.slice(0, 4)}–${compras.hasta.slice(0, 4)}. Montos nominales.`}
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
              detalle={`La provincia creció ${decimal.format(poblacion.variacionCensos)} % entre los censos 2010 y 2022.`}
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
              detalle={`Del ${formatDate(boletin.desde)} al ${formatDate(boletin.hasta)}: ${boletin.designaciones} designaciones, ${boletin.contrataciones} contrataciones y ${boletin.presupuesto} cambios de presupuesto.`}
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

      {/* Lo que no se publica */}
      {noPublicado.length > 0 && (
        <section className="flex flex-col gap-6">
          <Encabezado
            id="no-publicado"
            icon={RiEyeOffLine}
            titulo="Lo que el Estado no publica"
            bajada={`${noPublicado.length} datos que deberían ser públicos y no encontramos en ningún sitio oficial. Podés pedirlos vos.`}
          />
          <ul className={listVariants()}>
            {noPublicado.slice(0, 4).map((item) => (
              <li key={item.id}>
                <Link
                  to="/no-publicado"
                  search={{ dato: item.id } as never}
                  data-track="home.missing_data.open"
                  data-track-item={item.id}
                  className={cx(listRowVariants(), "items-start text-body-regular")}
                >
                  <RiEyeOffLine className="mt-0.5 size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-medium">{item.titulo}</span>
                    <span className="text-text-tertiary">{item.organismo}</span>
                  </span>
                  <RiArrowRightSLine className="size-4 shrink-0 text-text-link" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/no-publicado" className={buttonClassName({ variant: "secondary", className: "w-full sm:w-fit" })}>
            Ver los {noPublicado.length} y cómo pedirlos <RiArrowRightLine className="size-5" aria-hidden />
          </Link>
        </section>
      )}

      {guide && (
        <section className="flex flex-col gap-6">
          <Encabezado
            id="temas"
            icon={RiLayoutGridLine}
            titulo="Todo lo que hay"
            bajada={`${formatNumber(guide.counts.records)} registros ordenados en cuatro preguntas. Elegí por dónde seguir.`}
          />
          <EcosystemMap guide={guide} />
        </section>
      )}

      <section className="flex flex-col gap-6">
        <Encabezado
          id="como-leer"
          icon={RiBookOpenLine}
          titulo="Cómo leer estos datos"
          bajada="Cuatro reglas para entender lo que vas a ver."
        />
        <ReadingRules />
      </section>
    </div>
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

function Senal({ valor, texto, matiz }: { valor: string; texto: string; matiz: string }) {
  return (
    <div className={cx(tileVariants({ size: "lg" }), "flex flex-col gap-2")}>
      <span className="text-display-4-semibold tracking-tight tabular-nums">{valor}</span>
      <span className="text-text-primary text-pretty">{texto}</span>
      <span className="text-body-regular text-text-tertiary text-pretty">{matiz}</span>
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
