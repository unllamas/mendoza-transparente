import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import {
  Archive,
  ArrowRight,
  ArrowUpRight,
  Coins,
  ExternalLink,
  EyeOff,
  Landmark,
  type LucideIcon,
  Map as MapIcon,
  Scale,
  ScrollText,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  Users,
  UsersRound,
} from "lucide-react";
import type { ReactNode } from "react";

import { MapaMendoza } from "../charts/mapa.tsx";
import { Sparkline } from "../charts/sparkline.tsx";
import { CountUp } from "../count-up.tsx";
import { formatDate, formatNumber } from "../lib.ts";
import type { SourceMeta } from "../types.ts";

const route = getRouteApi("/");

const decimal = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });
const entero = (v: number) => formatNumber(Math.round(v));
const pesos = (v: number) => `$ ${entero(v)}`;
/** Cifras de miles de millones, en millones: "$ 965.709 M". */
const millones = (v: number) => `$ ${entero(v / 1e6)}`;

export function HomePage() {
  const { index, home, mapa, noPublicado } = route.useLoaderData();
  const navigate = useNavigate();
  const fuentesConDatos = index.sources.filter((s) => index.datasets.some((d) => d.source === s.id)).length;
  const registros = index.datasets.reduce((s, d) => s + d.rowCount, 0);
  const { deuda, coparticipacion, empleo, poblacion, compras, boletin, inflacion, dolar } = home;
  const fuente = (id: string) => index.sources.find((s) => s.id === id);

  return (
    <div className="flex flex-col gap-20">
      {/* Portada */}
      <section className="flex flex-col gap-8 pt-6">
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-tile px-3 py-1 text-sm text-ink-2">
          <span className="size-1.5 rounded-full bg-accent" aria-hidden />
          Rumbo a las elecciones provinciales 2027
        </span>
        <div className="flex max-w-3xl flex-col gap-5">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Mendoza, con los números sobre la mesa.
          </h1>
          <p className="max-w-2xl text-lg text-ink-2 text-pretty sm:text-xl">
            Cuánto debe la provincia, cuánta plata recibe cada municipio, a quién le compra el Estado y qué firma el
            gobierno cada día. Datos oficiales, ordenados y explicados, con la fuente siempre a mano.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="#numeros"
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-on-brand hover:bg-brand-hover"
          >
            Ver los números <ArrowRight className="size-4" aria-hidden />
          </a>
          <Link
            to="/fuentes"
            className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm hover:border-link/50"
          >
            <Archive className="size-4" aria-hidden /> De dónde salen
          </Link>
        </div>
        <p className="text-sm text-ink-muted">
          {fuentesConDatos} fuentes oficiales · {formatNumber(registros)} registros · Actualizado al{" "}
          {formatDate(index.generatedAt)}
        </p>
      </section>

      {/* Principios */}
      <section className="-mt-8 grid gap-4 rounded-2xl bg-tile p-5 sm:grid-cols-2 lg:grid-cols-4">
        {PRINCIPIOS.map(({ icon: Icon, titulo, texto }) => (
          <div key={titulo} className="flex items-start gap-3">
            <Icon className="mt-0.5 size-5 shrink-0 text-ink-2" aria-hidden />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{titulo}</span>
              <span className="text-sm text-ink-2 text-pretty">{texto}</span>
            </span>
          </div>
        ))}
      </section>

      {/* Las cifras principales */}
      <section id="numeros" className="flex scroll-mt-8 flex-col gap-6">
        <Encabezado titulo="Mendoza en números" bajada="Tocá cualquier cifra para ver el detalle, la evolución y la fuente." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {deuda && (
            <Cifra
              fuente={fuente("hacienda-deuda-stock")}
              to="/deuda"
              icon={Landmark}
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
              icon={Coins}
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
              icon={UsersRound}
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
              icon={ShoppingCart}
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
              icon={Users}
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
              icon={ScrollText}
              titulo="Boletín Oficial"
              valor={<CountUp value={boletin.normas} format={entero} />}
              unidad="normas"
              detalle={`Del ${formatDate(boletin.desde)} al ${formatDate(boletin.hasta)}: ${boletin.designaciones} designaciones, ${boletin.contrataciones} contrataciones y ${boletin.presupuesto} cambios de presupuesto.`}
            />
          )}
        </div>

        {(inflacion || dolar) && (
          <div className="flex flex-wrap gap-x-8 gap-y-3 rounded-xl bg-tile px-4 py-3 text-sm">
            {inflacion && (
              <Link to="/datos/$fuente" params={{ fuente: "indices" }} className="flex flex-wrap items-center gap-x-2 hover:text-link">
                <TrendingUp className="size-4 text-ink-muted" aria-hidden />
                <span className="text-ink-2">Inflación en Cuyo ({inflacion.periodo}):</span>
                <span className="font-medium tabular-nums">{decimal.format(inflacion.mensual)} % mensual</span>
                <span className="text-ink-muted tabular-nums">· {decimal.format(inflacion.interanual)} % en 12 meses</span>
              </Link>
            )}
            {dolar && (
              <Link to="/datos/$fuente" params={{ fuente: "indices" }} className="flex items-center gap-2 hover:text-link">
                <Coins className="size-4 text-ink-muted" aria-hidden />
                <span className="text-ink-2">Dólar oficial ({dolar.periodo}):</span>
                <span className="font-medium tabular-nums">{pesos(dolar.oficial)}</span>
              </Link>
            )}
          </div>
        )}
      </section>

      {/* Lo que no se publica */}
      {noPublicado.length > 0 && (
        <section className="flex flex-col gap-6">
          <Encabezado
            icon={EyeOff}
            titulo="Lo que el Estado no publica"
            bajada={`${noPublicado.length} datos que deberían ser públicos y no encontramos en ningún sitio oficial. Podés pedirlos vos.`}
          />
          <ul className="grid gap-2 sm:grid-cols-2">
            {noPublicado.slice(0, 6).map((item) => (
              <li key={item.id}>
                <Link
                  to="/no-publicado"
                  hash={item.id}
                  className="flex h-full items-start gap-3 rounded-xl border border-line px-4 py-3 text-sm hover:border-link/50"
                >
                  <EyeOff className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">{item.titulo}</span>
                    <span className="text-ink-muted">{item.organismo}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            to="/no-publicado"
            className="inline-flex w-fit items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-on-brand hover:bg-brand-hover"
          >
            Ver todos y cómo pedirlos <ArrowRight className="size-4" aria-hidden />
          </Link>
        </section>
      )}

      {/* Mapa */}
      {coparticipacion && mapa && (
        <section className="flex flex-col gap-6">
          <Encabezado
            icon={MapIcon}
            titulo="Tu departamento"
            bajada={`Cuánto recibió cada municipio por habitante en ${coparticipacion.anio}. Tocá uno para ver su detalle.`}
          />
          <div>
            <MapaMendoza
              mapa={mapa}
              valores={coparticipacion.porMunicipio}
              formatValue={pesos}
              seleccionado={null}
              onSelect={() => navigate({ to: "/coparticipacion" })}
              leyenda={`Pesos por habitante (de ${coparticipacion.referencia})`}
            />
          </div>
        </section>
      )}

      {/* Señales */}
      {compras && (
        <section className="flex flex-col gap-6">
          <Encabezado
            icon={Scale}
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
            className="inline-flex w-fit items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-on-brand hover:bg-brand-hover"
          >
            Ver todas las señales y sus casos <ArrowRight className="size-4" aria-hidden />
          </Link>
        </section>
      )}

    </div>
  );
}


const PRINCIPIOS: { icon: LucideIcon; titulo: string; texto: string }[] = [
  { icon: ShieldCheck, titulo: "Cada número tiene fuente", texto: "Todo dato enlaza al archivo oficial del que sale." },
  { icon: Archive, titulo: "Nada se pierde", texto: "Guardamos cada versión de los archivos, aunque después los borren." },
  { icon: Scale, titulo: "La misma vara para todos", texto: "Misma metodología para todos los gobiernos y partidos." },
  { icon: ArrowUpRight, titulo: "Abierto", texto: "El código y los datos se pueden descargar y reutilizar." },
];

function Encabezado({ titulo, bajada, icon: Icon }: { titulo: string; bajada?: string; icon?: LucideIcon }) {
  return (
    <div className="flex max-w-2xl flex-col gap-1.5">
      <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        {Icon && <Icon className="size-5 text-ink-muted" aria-hidden />}
        {titulo}
      </h2>
      {bajada && <p className="text-ink-2 text-pretty">{bajada}</p>}
    </div>
  );
}

type CifraProps = {
  icon: LucideIcon;
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
  const linkClass = "after:absolute after:inset-0 after:rounded-2xl";
  const tituloLink =
    to === "/datos/$fuente" ? (
      <Link to={to} params={params} className={linkClass}>
        {titulo}
      </Link>
    ) : (
      <Link to={to} className={linkClass}>
        {titulo}
      </Link>
    );
  return (
    <div className="group relative flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-link/50">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm text-ink-2">
          <Icon className="size-4 shrink-0 text-ink-muted" aria-hidden />
          <span className="truncate">{tituloLink}</span>
        </span>
        <ArrowUpRight
          className="size-4 shrink-0 text-ink-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          aria-hidden
        />
      </div>
      <div className="flex items-baseline gap-2 whitespace-nowrap">
        <span className="text-3xl font-semibold tracking-tight sm:text-4xl">{valor}</span>
        {unidad && <span className="text-sm text-ink-muted">{unidad}</span>}
      </div>
      {serie && <Sparkline values={serie} width={320} className="w-full" />}
      <p className="text-sm text-ink-muted text-pretty">{detalle}</p>
      {fuente?.url && (
        <div className="mt-auto border-t border-line pt-3">
          <a
            href={fuente.url}
            target="_blank"
            rel="noreferrer"
            className="relative z-10 inline-flex max-w-full items-center gap-1 text-xs text-ink-muted hover:text-link"
          >
            <Landmark className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">Fuente: {fuente.organismo || fuente.nombre}</span>
            <ExternalLink className="size-3 shrink-0" aria-hidden />
          </a>
        </div>
      )}
    </div>
  );
}

function Senal({ valor, texto, matiz }: { valor: string; texto: string; matiz: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-tile p-5">
      <span className="text-3xl font-semibold tracking-tight tabular-nums">{valor}</span>
      <span className="text-ink text-pretty">{texto}</span>
      <span className="text-sm text-ink-muted text-pretty">{matiz}</span>
    </div>
  );
}
