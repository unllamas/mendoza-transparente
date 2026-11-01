import { Alert } from "@mt/ui/components/alert";
import { PersonAvatar } from "@mt/ui/components/avatar";
import { buttonClassName } from "@mt/ui/components/base/buttons/button";
import { cardVariants, listRowVariants, listVariants, tileVariants } from "@mt/ui/components/card";
import { ImageViewer } from "@mt/ui/components/image-viewer";
import { PageHeader, SectionTitle } from "@mt/ui/components/section";
import { cx } from "@mt/ui/lib/cx";
import {
  RiArrowRightSLine,
  RiBankLine,
  RiBuilding2Line,
  RiExternalLinkLine,
  RiFileTextLine,
  RiHistoryLine,
  RiMailLine,
  RiMapPinLine,
  RiPlaneLine,
  RiSurveyLine,
  RiZoomInLine,
} from "@remixicon/react";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { formatMoneda } from "@/celdas.ts";
import { BarList } from "@/charts/bar-list.tsx";
import { Breadcrumbs, WithBreadcrumbs } from "@/components/breadcrumbs.tsx";
import { ListSearch } from "@/components/list-search.tsx";
import { FuentesOficiales } from "@/components/official-sources.tsx";
import { ShareButton } from "@/components/share-button.tsx";
import { TrackedSegmented } from "@/components/tracked-segmented.tsx";
import { Career } from "@/features/officials/components/career.tsx";
import { TripRows } from "@/features/officials/components/trip-rows.tsx";
import { formatDate, formatNumber, normalizeText } from "@/lib.ts";
import { ROLES, roleBySlug, slug } from "@/slug.ts";
import type { Funcionario, FuncionariosTema, GrupoFuncionario, PartyRef } from "@/types.ts";
import { useSetUrlParams, useUrlOption, useUrlText } from "@/url-state.ts";

const route = getRouteApi("/funcionarios");
const routeFicha = getRouteApi("/funcionarios/$role/$slug");
const roleApi = getRouteApi("/funcionarios/$role");

type Pestana = "ejecutivo" | "legislatura" | "intendentes" | "nacion";

const PESTANAS: { value: Pestana; label: string; grupos: GrupoFuncionario[] }[] = [
  { value: "ejecutivo", label: "Gobierno", grupos: ["ejecutivo"] },
  { value: "legislatura", label: "Legislatura", grupos: ["diputados_provincial", "senado_provincial"] },
  { value: "intendentes", label: "Intendentes", grupos: ["intendentes"] },
  { value: "nacion", label: "Congreso nacional", grupos: ["diputados_nacional", "senado_nacional"] },
];

const NOMBRE_GRUPO: Record<GrupoFuncionario, string> = {
  ejecutivo: "Poder Ejecutivo provincial",
  intendentes: "Intendentes",
  diputados_provincial: "Diputados provinciales",
  senado_provincial: "Senadores provinciales",
  diputados_nacional: "Diputados nacionales por Mendoza",
  senado_nacional: "Senadores nacionales por Mendoza",
};

/** Qué pedido de «Lo que el Estado no publica» corresponde cuando no hay sueldo publicado. */
const PEDIDO_SUELDO: Partial<Record<GrupoFuncionario, string>> = {
  ejecutivo: "nomina-sueldos",
  intendentes: "nomina-sueldos",
  diputados_provincial: "dieta-legisladores",
  senado_provincial: "dieta-legisladores",
};

export function FuncionariosPage() {
  const { personas } = route.useLoaderData();
  const [pestana] = useUrlOption<Pestana>("grupo", ["ejecutivo", "legislatura", "intendentes", "nacion"], "ejecutivo");
  const [busqueda, setBusqueda] = useUrlText("q");
  const setParams = useSetUrlParams();

  const grupos = PESTANAS.find((p) => p.value === pestana)!.grupos;
  const visibles = useMemo(() => {
    const q = normalizeText(busqueda.trim());
    return personas.filter((p) =>
      q
        ? normalizeText(`${p.nombre} ${p.cargo} ${p.organismo} ${p.bloque ?? ""} ${p.partido ?? ""}`).includes(q)
        : grupos.includes(p.grupo),
    );
  }, [personas, grupos, busqueda]);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader action={<ShareButton />} icon={RiBankLine} topic="Funcionarios" title="¿Quiénes nos representan?">
        Gobernador, ministros, legisladores, intendentes y quienes representan a Mendoza en el Congreso: su cargo, su partido o bloque,
        hasta cuándo dura su mandato y cuánto cobran cuando el dato es público.
      </PageHeader>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <TrackedSegmented
          label="Grupo"
          options={PESTANAS}
          value={pestana}
          onChange={(v) => setParams({ grupo: v === "ejecutivo" ? null : v, q: null })}
        />
        <ListSearch
          value={busqueda}
          onChange={setBusqueda}
          placeholder="Buscar por nombre, bloque o municipio"
          label="Buscar funcionario"
        />
      </div>

      {busqueda ? (
        <Lista id="resultados" titulo={`${visibles.length} resultados`} personas={visibles} />
      ) : (
        grupos.map((g) => {
          const delGrupo = visibles.filter((p) => p.grupo === g);
          return (
            <div key={g} className="flex flex-col gap-4">
              {(g === "diputados_provincial" || g === "senado_provincial") && <Bloques personas={delGrupo} />}
              <Lista id={ROLES[g].slug} titulo={`${NOMBRE_GRUPO[g]} (${delGrupo.length})`} personas={delGrupo} role={ROLES[g].slug} />
            </div>
          );
        })
      )}

      <Link
        to="/funcionarios/historial"
        id="funcionarios-historial"
        data-track="officials.history.open"
        className={cx(cardVariants(), "flex items-center gap-3")}
      >
        <RiHistoryLine className="size-6 shrink-0 text-text-tertiary" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-medium text-text-link">¿Quién ocupó cada cargo antes?</span>
          <span className="text-body-regular text-text-secondary">
            Gobernadores desde 2015, los cargos que ganó cada partido y los ex funcionarios.
          </span>
        </span>
        <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
      </Link>

      <Link
        to="/funcionarios/viajes"
        id="funcionarios-viajes"
        data-track="officials.trips.open"
        className={cx(cardVariants(), "flex items-center gap-3")}
      >
        <RiPlaneLine className="size-6 shrink-0 text-text-tertiary" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-medium text-text-link">¿A dónde viajaron en misión oficial?</span>
          <span className="text-body-regular text-text-secondary">
            Los viajes que autorizó el Gobierno por decreto, quiénes fueron y qué dice cada uno sobre quién pagó.
          </span>
        </span>
        <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
      </Link>

      <FuentesOficiales ids={["autoridades", "legislatura"]} />
    </div>
  );
}

function Bloques({ personas }: { personas: Funcionario[] }) {
  const conteo = new Map<string, { valor: number; party: PartyRef | null }>();
  for (const p of personas) {
    const name = p.bloque ?? "Sin bloque";
    conteo.set(name, { valor: (conteo.get(name)?.valor ?? 0) + 1, party: p.bloque ? p.party : null });
  }
  const items = [...conteo]
    .sort((a, b) => b[1].valor - a[1].valor)
    .map(([nombre, { valor, party }]) => ({ nombre, valor, etiqueta: party ? <PartyLink party={party}>{nombre}</PartyLink> : undefined }));
  return (
    <details className={cx(cardVariants(), "group")}>
      <summary className="cursor-pointer list-none text-body-medium [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-1.5">
          <RiArrowRightSLine className="size-5 transition-transform group-open:rotate-90" aria-hidden />
          Composición por bloque · {items.length} bloques
        </span>
      </summary>
      <div className="mt-4">
        <BarList items={items} formatValue={(v) => `${v} ${v === 1 ? "banca" : "bancas"}`} />
      </div>
    </details>
  );
}

/** The name of a party, front or bloc inside a text, linked to its page. */
function PartyLink({ party, children }: { party: PartyRef; children: string }) {
  return (
    <Link to="/partidos/$slug" params={{ slug: party.slug }} data-track="official.party.open" className="text-text-link hover:underline">
      {children}
    </Link>
  );
}

function subtitulo(p: Funcionario) {
  if (p.grupo === "intendentes") return [p.organismo, p.partido].filter(Boolean).join(" · ");
  if (p.grupo === "ejecutivo") return [p.cargo, p.partido].filter(Boolean).join(" · ");
  return [p.bloque ?? p.partido, p.seccion].filter(Boolean).join(" · ");
}

function Lista({ id, titulo, personas, role }: { id: string; titulo: string; personas: Funcionario[]; role?: string }) {
  return (
    <section id={id} className="flex scroll-mt-20 flex-col gap-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <SectionTitle id={id} className="min-w-0">
          <span className="block truncate">{titulo}</span>
        </SectionTitle>
        {role && (
          <Link
            to="/funcionarios/$role"
            params={{ role }}
            className="shrink-0 text-body-regular whitespace-nowrap text-text-link hover:underline"
          >
            Ver página ›
          </Link>
        )}
      </div>
      <ul className={listVariants()}>
        {personas.map((p) => (
          <li key={p.id}>
            <Link to="/funcionarios/$role/$slug" params={{ role: p.role, slug: p.slug }} className={listRowVariants()}>
              <PersonAvatar
                name={p.nombre}
                photo={p.foto}
                party={p.party}
                partyMissing={p.partyMissing}
                className="size-10 text-caption-1-regular"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium group-hover:text-text-link">{p.nombre}</span>
                <span className="truncate text-body-regular text-text-tertiary">{subtitulo(p)}</span>
              </span>
              {p.mandatoHasta && (
                <span className="hidden text-body-regular whitespace-nowrap text-text-tertiary tabular-nums sm:block">
                  hasta {p.mandatoHasta}
                </span>
              )}
              <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Foto oficial si existe; si no, las iniciales. */
/** Página de un cargo: `/funcionarios/diputados-provinciales`. */
export function RolePage() {
  const { personas } = roleApi.useLoaderData();
  const { role } = roleApi.useParams();
  const key = roleBySlug(role);
  if (!key) return <NotFound />;
  const r = ROLES[key];
  const people = personas.filter((p) => p.grupo === key);
  const legislature = key === "diputados_provincial" || key === "senado_provincial";
  // Provincial legislators are listed by electoral section (who each area elects).
  const sections = legislature ? [...new Set(people.map((p) => p.seccion ?? "Sin sección"))].sort(sectionOrder) : [null];
  return (
    <div className="flex flex-col gap-10">
      <WithBreadcrumbs items={[{ label: "Funcionarios", to: "/funcionarios" }]} current={{ label: r.title, icon: RiBankLine }}>
        <PageHeader action={<ShareButton />} title={r.title}>
          {r.description}
        </PageHeader>
      </WithBreadcrumbs>
      {legislature && <Bloques personas={people} />}
      {sections.map((sec) => {
        const list = sec === null ? people : people.filter((p) => (p.seccion ?? "Sin sección") === sec);
        return <Lista key={sec ?? "todos"} id={sec ? slug(sec) : "todos"} titulo={`${sec ?? r.title} (${list.length})`} personas={list} />;
      })}
      <FuentesOficiales ids={["autoridades", "legislatura"]} />
    </div>
  );
}

const ORDINALS = ["Primera", "Segunda", "Tercera", "Cuarta"];
const sectionOrder = (a: string, b: string) =>
  (ORDINALS.findIndex((o) => a.startsWith(o)) + 1 || 9) - (ORDINALS.findIndex((o) => b.startsWith(o)) + 1 || 9);

function NotFound() {
  return (
    <div className="flex flex-col gap-3">
      <Breadcrumbs items={[{ label: "Funcionarios", to: "/funcionarios" }]} current={{ label: "No encontrada" }} />
      <h1 className="text-title-1-semibold tracking-tight">No encontramos a esa persona</h1>
      <p className="text-text-secondary">Puede que haya dejado el cargo o que el enlace esté mal escrito.</p>
      <Link to="/funcionarios" className="w-fit text-text-link hover:underline">
        Ver todos los funcionarios ›
      </Link>
    </div>
  );
}

/** Página de la ficha de una persona: `/funcionarios/<cargo>/<nombre>`. */
export function FuncionarioPage() {
  const { personas, usd } = routeFicha.useLoaderData();
  const { role, slug } = routeFicha.useParams();
  const p = personas.find((x) => x.role === role && x.slug === slug);
  if (!p) return <NotFound />;
  return (
    <WithBreadcrumbs
      items={[
        { label: "Funcionarios", to: "/funcionarios" },
        { label: ROLES[p.grupo].title, to: `/funcionarios/${p.role}` },
      ]}
      current={{ label: p.nombre }}
    >
      <div className="max-w-2xl">
        <FichaFuncionario persona={p} usd={usd} />
      </div>
    </WithBreadcrumbs>
  );
}

/**
 * Cara de la ficha. Si hay una versión grande de la foto, es un botón que la abre ampliada, con quién la publica;
 * la lupa abajo a la izquierda avisa que se puede tocar (en el celular no hay hover). La insignia del partido queda
 * abajo a la derecha, como en todo el sitio.
 */
function OfficialFace({ persona: p }: { persona: Funcionario }) {
  const [open, setOpen] = useState(false);
  const face = (
    <PersonAvatar name={p.nombre} photo={p.foto} party={p.party} partyMissing={p.partyMissing} className="size-16 text-headline-regular" />
  );
  if (!p.largePhoto) return face;
  return (
    <>
      <button
        type="button"
        id="funcionario-foto"
        data-track="official.photo.open"
        data-track-role={p.role}
        aria-label={`Ver la foto de ${p.nombre} más grande`}
        onClick={() => setOpen(true)}
        className="group relative shrink-0 cursor-zoom-in rounded-full outline-offset-2 motion-safe:transition-transform motion-safe:duration-150 motion-safe:active:scale-95"
      >
        {face}
        <span
          aria-hidden
          className="absolute -bottom-0.5 -left-0.5 flex size-6 items-center justify-center rounded-full bg-background-action text-text-action ring-2 ring-background-full group-hover:bg-background-action-hover"
        >
          <RiZoomInLine className="size-3.5" />
        </span>
      </button>
      {open && (
        <ImageViewer
          src={p.largePhoto}
          alt={`Foto de ${p.nombre}`}
          caption={`${p.nombre}, ${p.cargo}.${p.fotoCredito ? ` Foto: ${p.fotoCredito}.` : ""}`}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** Contenido de la ficha: foto, cargo, mandato, declaración jurada y sueldo publicado. */
function FichaFuncionario({ persona: p, usd }: { persona: Funcionario; usd?: FuncionariosTema["usd"] }) {
  const pedido = PEDIDO_SUELDO[p.grupo];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <OfficialFace persona={p} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="text-title-2-semibold tracking-tight text-balance sm:text-title-1-regular">{p.nombre}</h1>
          <span className="text-body-regular text-text-secondary">{p.cargo}</span>
        </div>
      </div>

      {p.nota && <Alert title="Atención">{p.nota}</Alert>}

      <Territorio persona={p} />

      <dl className={cx(tileVariants(), "grid grid-cols-2 gap-x-3 gap-y-4 text-body-regular")}>
        <Campo label="Organismo" value={p.organismo} wide />
        {p.bloque && <Campo label="Bloque" value={p.bloque} party={p.party && affiliationIsBloc(p) ? p.party : null} />}
        <Campo
          label="Partido o frente"
          value={p.partido ?? (p.party || p.partyMissing ? "No lo informa la fuente oficial" : "No corresponde: es un cargo designado")}
          muted={!p.partido}
          party={p.party && p.partido && !affiliationIsBloc(p) ? p.party : null}
        />
        {p.seccion && <Campo label="Electo por" value={p.seccion} />}
        {(p.mandatoDesde || p.mandatoHasta) && <Campo label="Mandato" value={`${p.mandatoDesde ?? "?"}–${p.mandatoHasta ?? "?"}`} />}
      </dl>

      <Declaracion persona={p} usd={usd} />

      <Career positions={p.pastPositions ?? []} elected={p.elected ?? []} headingLevel="h4" />

      {p.trips && p.trips.length > 0 && (
        <section className="flex flex-col gap-2">
          <h4 className="text-body-semibold">
            Viajes oficiales <span className="font-normal text-text-tertiary">· {p.trips.length}</span>
          </h4>
          <TripRows trips={p.trips} track="official.trip.open" />
          <p className="text-caption-1-regular text-text-tertiary">
            Misiones oficiales autorizadas por decreto en el Boletín Oficial.{" "}
            <Link to="/funcionarios/viajes" data-track="official.trips.open" className="text-text-link hover:underline">
              Todos los viajes oficiales ›
            </Link>
          </p>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h4 className="text-body-semibold">Cuánto cobra</h4>
        {p.remuneracion.length > 0 ? (
          <>
            <ul className="flex flex-col gap-2 text-body-regular">
              {p.remuneracion.map((r) => (
                <li key={r.concepto} className="flex items-baseline justify-between gap-3">
                  <span className="text-text-secondary">{r.concepto}</span>
                  <span className="font-medium whitespace-nowrap tabular-nums">{formatMoneda(r.monto, "ARS")}</span>
                </li>
              ))}
            </ul>
            <p className="text-caption-1-regular text-text-tertiary">
              Montos brutos mensuales del cargo, vigentes a {p.remuneracion[0]!.periodo}.{" "}
              <a href={p.remuneracion[0]!.fuenteUrl} target="_blank" rel="noreferrer" className="text-text-link hover:underline">
                Fuente oficial
              </a>
            </p>
          </>
        ) : (
          <Alert title="No está publicado">
            El sueldo de este cargo no figura en ningún sitio oficial.{" "}
            {pedido && (
              <Link to="/no-publicado" search={{ dato: pedido } as never} className="font-medium text-text-link hover:underline">
                Pedilo con la Ley 9070 ›
              </Link>
            )}
          </Alert>
        )}
      </section>

      {/diputados|senado/.test(p.grupo) && (
        <p className="flex items-center gap-2 text-body-regular text-text-tertiary">
          <RiSurveyLine className="size-4 shrink-0" aria-hidden /> Próximamente: los proyectos que presentó y cómo votó.
        </p>
      )}

      <div className="flex flex-col gap-2 border-t border-separator-border pt-4 text-body-regular">
        {p.email && (
          <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1.5 text-text-link hover:underline">
            <RiMailLine className="size-4" aria-hidden /> {p.email}
          </a>
        )}
        {p.perfilUrl && (
          <a
            href={p.perfilUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-text-link hover:underline"
          >
            Perfil oficial <RiExternalLinkLine className="size-4" aria-hidden />
          </a>
        )}
        {p.fotoCredito && <span className="text-caption-1-regular text-text-tertiary">Foto: {p.fotoCredito}</span>}
        <a
          href={p.fuenteUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-text-tertiary hover:text-text-link hover:underline"
        >
          <RiBankLine className="size-4" aria-hidden /> De dónde sale este dato <RiExternalLinkLine className="size-4" aria-hidden />
        </a>
      </div>
    </div>
  );
}

/** Where this person governs or who they represent, linked to the municipality pages. */
function Territorio({ persona: p }: { persona: Funcionario }) {
  if (p.agency) {
    return (
      <Link
        to="/gobierno/$slug"
        params={{ slug: p.agency.slug }}
        className={cx(cardVariants(), "flex items-center gap-3 text-body-regular")}
      >
        <RiBuilding2Line className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-text-tertiary">Organismo que conduce o integra</span>
          <span className="truncate font-medium group-hover:text-text-link">{p.agency.name}</span>
        </span>
        <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
      </Link>
    );
  }
  if (!p.municipalities.length) {
    const nacional = p.grupo === "diputados_nacional" || p.grupo === "senado_nacional";
    return (
      <p className="flex items-center gap-2 text-body-regular text-text-secondary">
        <RiMapPinLine className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
        {nacional ? "Representa a toda la provincia de Mendoza en el Congreso." : "Su cargo abarca toda la provincia."}{" "}
        <Link to="/municipios" className="whitespace-nowrap text-text-link hover:underline">
          Ver municipios ›
        </Link>
      </p>
    );
  }
  const intendente = p.grupo === "intendentes";
  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-1.5 text-body-semibold">
        <RiMapPinLine className="size-4 text-foreground-icon-secondary" aria-hidden />
        {intendente ? "Gobierna" : `Representa a la ${p.seccion?.toLowerCase() ?? "sección"}`}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {p.municipalities.map((m) => (
          <li key={m.slug}>
            <Link to="/municipios/$slug" params={{ slug: m.slug }} className={buttonClassName({ variant: "secondary" })}>
              {m.name} <RiArrowRightSLine className="size-5" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const ETICA = "https://eticapublica.mendoza.gov.ar/declaraciones";

const millonesDePesos = (v: number) =>
  v >= 1e6 ? `$ ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(v / 1e6)} millones` : formatMoneda(v, "ARS");

function Declaracion({ persona: p, usd }: { persona: Funcionario; usd?: FuncionariosTema["usd"] }) {
  const nacional = p.grupo === "diputados_nacional" || p.grupo === "senado_nacional";
  const d = p.ddjj;
  return (
    <section className="flex flex-col gap-3">
      <h4 className="flex items-center gap-1.5 text-body-semibold">
        <RiFileTextLine className="size-4 text-foreground-icon-secondary" aria-hidden /> Qué declara
      </h4>
      {d ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className={cx(tileVariants({ size: "sm" }), "col-span-2 flex flex-col gap-0.5")}>
              <span className="text-caption-1-regular text-text-tertiary">Inmuebles y vehículos a su nombre, en pesos a valor fiscal</span>
              <span className="text-title-3-semibold whitespace-nowrap tabular-nums">{millonesDePesos(d.totalBienes)}</span>
              {usd && d.totalBienes > 0 && (
                <span className="text-caption-1-regular text-text-tertiary">
                  Unos US$ {formatNumber(Math.round(d.totalBienes / usd.rate))} al dólar oficial de {formatMonth(usd.month)}
                </span>
              )}
            </div>
            <div className={cx(tileVariants({ size: "sm" }), "flex flex-col gap-0.5")}>
              <span className="text-caption-1-regular text-text-tertiary">Inmuebles</span>
              <span className="font-medium tabular-nums">{d.inmuebles}</span>
            </div>
            <div className={cx(tileVariants({ size: "sm" }), "flex flex-col gap-0.5")}>
              <span className="text-caption-1-regular text-text-tertiary">Vehículos</span>
              <span className="font-medium tabular-nums">{d.rodados}</span>
            </div>
          </div>
          {d.declaredWithoutAmount.length > 0 && (
            <p className="text-body-regular text-text-secondary text-pretty">
              También declara {listaHumana(d.declaredWithoutAmount)}, pero el sitio oficial no publica esos montos.
            </p>
          )}
          <p className="text-caption-1-regular text-text-tertiary">
            Última declaración publicada{d.fecha ? ` el ${formatDate(d.fecha)}` : ""} ({d.declaracionesPublicadas}{" "}
            {d.declaracionesPublicadas === 1 ? "declaración" : "declaraciones"} en total).
          </p>
          <Alert variant="note" title="Por qué el número parece bajo">
            El valor fiscal es el que usa el Estado para cobrar impuestos y suele estar muy por debajo del precio de mercado. Además, el
            total no incluye cuentas bancarias, efectivo, inversiones ni participaciones en empresas: la Oficina de Ética Pública muestra
            que se declaran, pero no cuánto.{" "}
            <Link to="/no-publicado" search={{ dato: "ddjj-montos" } as never} className="font-medium text-text-link hover:underline">
              Pedí los montos ›
            </Link>
          </Alert>
        </>
      ) : (
        <p className="text-body-regular text-text-secondary">
          {nacional
            ? "Los legisladores nacionales presentan su declaración ante la Oficina Anticorrupción de la Nación."
            : "No encontramos su declaración publicada en la Oficina de Ética Pública."}
        </p>
      )}
      <a
        href={nacional ? "https://www.argentina.gob.ar/anticorrupcion" : ETICA}
        target="_blank"
        rel="noreferrer"
        className="inline-flex w-fit items-center gap-1.5 text-body-regular text-text-link hover:underline"
      >
        {nacional ? "Oficina Anticorrupción" : "Ver en Ética Pública"} <RiExternalLinkLine className="size-4" aria-hidden />
      </a>
    </section>
  );
}

const listaHumana = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}`);
const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const formatMonth = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`;

/** Legislators show their bloc (what the chamber publishes); the rest, their party or front. */
const affiliationIsBloc = (p: Funcionario) => /diputados|senado/.test(p.grupo) && Boolean(p.bloque);

function Campo({
  label,
  value,
  wide,
  muted,
  party,
}: {
  label: string;
  value: string;
  wide?: boolean;
  muted?: boolean;
  /** Links the value to the page of that party, front or bloc. */
  party?: PartyRef | null;
}) {
  return (
    <div className={`flex flex-col gap-0.5 ${wide ? "col-span-2" : ""}`}>
      <dt className="text-caption-1-regular text-text-tertiary">{label}</dt>
      <dd className={`text-pretty ${muted ? "text-text-tertiary" : ""}`}>
        {party ? (
          <Link
            to="/partidos/$slug"
            params={{ slug: party.slug }}
            data-track="official.party.open"
            className="font-medium text-text-link hover:underline"
          >
            {value} ›
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
