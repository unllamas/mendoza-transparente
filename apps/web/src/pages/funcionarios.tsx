import { getRouteApi, Link } from "@tanstack/react-router";
import { Building2, ChevronRight, ExternalLink, FileText, Landmark, Mail, MapPin, Search, Vote } from "lucide-react";
import { useMemo, useState } from "react";

import { BarList } from "../charts/bar-list.tsx";
import { formatMoneda } from "../celdas.ts";
import { formatDate, formatNumber } from "../lib.ts";
import { FuentesOficiales } from "../fuente.tsx";
import { ROLES, roleBySlug } from "../slug.ts";
import type { Funcionario, FuncionariosTema, GrupoFuncionario } from "../types.ts";
import { Aviso, Migas, PageHeader, PersonAvatar, Segmented } from "./components.tsx";

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

const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function FuncionariosPage() {
  const { personas } = route.useLoaderData();
  const [pestana, setPestana] = useState<Pestana>("ejecutivo");
  const [busqueda, setBusqueda] = useState("");

  const grupos = PESTANAS.find((p) => p.value === pestana)!.grupos;
  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return personas.filter((p) =>
      q ? normalizar(`${p.nombre} ${p.cargo} ${p.organismo} ${p.bloque ?? ""} ${p.partido ?? ""}`).includes(q) : grupos.includes(p.grupo),
    );
  }, [personas, grupos, busqueda]);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader icon={Landmark} tema="Funcionarios" titulo="¿Quiénes nos representan?">
        Gobernador, ministros, legisladores, intendentes y quienes representan a Mendoza en el Congreso: su cargo, su
        partido o bloque, hasta cuándo dura su mandato y cuánto cobran cuando el dato es público.
      </PageHeader>
      <FuentesOficiales ids={["autoridades", "legislatura"]} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Segmented label="Grupo" options={PESTANAS} value={pestana} onChange={(v) => { setPestana(v); setBusqueda(""); }} />
        <label className="relative flex items-center sm:w-72">
          <Search className="pointer-events-none absolute left-3 size-4 text-ink-muted" aria-hidden />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, bloque o municipio"
            aria-label="Buscar funcionario"
            className="w-full rounded-lg border border-line bg-surface py-2 pr-3 pl-9 text-sm outline-none placeholder:text-ink-muted focus:border-link"
          />
        </label>
      </div>

      {busqueda ? (
        <Lista titulo={`${visibles.length} resultados`} personas={visibles} />
      ) : (
        grupos.map((g) => {
          const delGrupo = visibles.filter((p) => p.grupo === g);
          return (
            <div key={g} className="flex flex-col gap-4">
              {(g === "diputados_provincial" || g === "senado_provincial") && <Bloques personas={delGrupo} />}
              <Lista titulo={`${NOMBRE_GRUPO[g]} (${delGrupo.length})`} personas={delGrupo} role={ROLES[g].slug} />
            </div>
          );
        })
      )}
    </div>
  );
}

function Bloques({ personas }: { personas: Funcionario[] }) {
  const conteo = new Map<string, number>();
  for (const p of personas) conteo.set(p.bloque ?? "Sin bloque", (conteo.get(p.bloque ?? "Sin bloque") ?? 0) + 1);
  const items = [...conteo].sort((a, b) => b[1] - a[1]).map(([nombre, valor]) => ({ nombre, valor }));
  return (
    <details className="group rounded-xl bg-tile p-4">
      <summary className="cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-1.5">
          <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
          Composición por bloque · {items.length} bloques
        </span>
      </summary>
      <div className="mt-4">
        <BarList items={items} formatValue={(v) => `${v} ${v === 1 ? "banca" : "bancas"}`} />
      </div>
    </details>
  );
}

function subtitulo(p: Funcionario) {
  if (p.grupo === "intendentes") return [p.organismo, p.partido].filter(Boolean).join(" · ");
  if (p.grupo === "ejecutivo") return [p.cargo, p.partido].filter(Boolean).join(" · ");
  return [p.bloque ?? p.partido, p.seccion].filter(Boolean).join(" · ");
}

function Lista({ titulo, personas, role }: { titulo: string; personas: Funcionario[]; role?: string }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex min-w-0 items-baseline justify-between gap-3 text-lg font-semibold tracking-tight">
        <span className="truncate">{titulo}</span>
        {role && (
          <Link to="/funcionarios/$role" params={{ role }} className="shrink-0 text-sm font-normal whitespace-nowrap text-link hover:underline">
            Ver página ›
          </Link>
        )}
      </h2>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl bg-tile">
        {personas.map((p) => (
          <li key={p.id}>
            <Link
              to="/funcionarios/$role/$slug"
              params={{ role: p.role, slug: p.slug }}
              className="group flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-grid/50 sm:px-5"
            >
              <Avatar persona={p} className="size-10 text-xs" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium group-hover:text-link">{p.nombre}</span>
                <span className="truncate text-sm text-ink-muted">{subtitulo(p)}</span>
              </span>
              {p.mandatoHasta && (
                <span className="hidden text-sm whitespace-nowrap text-ink-muted tabular-nums sm:block">hasta {p.mandatoHasta}</span>
              )}
              <ChevronRight className="size-4 shrink-0 text-ink-muted group-hover:text-link" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Foto oficial si existe; si no, las iniciales. */
export function Avatar({ persona: p, className }: { persona: Pick<Funcionario, "nombre" | "foto">; className: string }) {
  return <PersonAvatar name={p.nombre} photo={p.foto} className={className} />;
}

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
      <Migas items={[{ label: "Funcionarios", to: "/funcionarios" }, { label: r.title }]} />
      <PageHeader icon={Landmark} tema="Funcionarios" titulo={r.title}>
        {r.description}
      </PageHeader>
      <FuentesOficiales ids={["autoridades", "legislatura"]} />
      {legislature && <Bloques personas={people} />}
      {sections.map((sec) => {
        const list = sec === null ? people : people.filter((p) => (p.seccion ?? "Sin sección") === sec);
        return <Lista key={sec ?? "todos"} titulo={`${sec ?? r.title} (${list.length})`} personas={list} />;
      })}
    </div>
  );
}

const ORDINALS = ["Primera", "Segunda", "Tercera", "Cuarta"];
const sectionOrder = (a: string, b: string) =>
  (ORDINALS.findIndex((o) => a.startsWith(o)) + 1 || 9) - (ORDINALS.findIndex((o) => b.startsWith(o)) + 1 || 9);

function NotFound() {
  return (
    <div className="flex flex-col gap-3">
      <Migas items={[{ label: "Funcionarios", to: "/funcionarios" }, { label: "No encontrada" }]} />
      <h1 className="text-2xl font-semibold tracking-tight">No encontramos a esa persona</h1>
      <p className="text-ink-2">Puede que haya dejado el cargo o que el enlace esté mal escrito.</p>
      <Link to="/funcionarios" className="w-fit text-link hover:underline">
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
    <div className="flex max-w-2xl flex-col gap-6">
      <Migas
        items={[
          { label: "Funcionarios", to: "/funcionarios" },
          { label: ROLES[p.grupo].title, to: `/funcionarios/${p.role}` },
          { label: p.nombre },
        ]}
      />
      <FichaFuncionario persona={p} usd={usd} />
    </div>
  );
}

/** Contenido de la ficha: foto, cargo, mandato, sueldo publicado y declaración jurada. */
export function FichaFuncionario({ persona: p, usd }: { persona: Funcionario; usd?: FuncionariosTema["usd"] }) {
  const pedido = PEDIDO_SUELDO[p.grupo];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Avatar persona={p} className="size-16 text-base" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">{p.nombre}</h1>
          <span className="text-sm text-ink-2">{p.cargo}</span>

        </div>
      </div>

      {p.nota && <Aviso titulo="Atención">{p.nota}</Aviso>}

      <Territorio persona={p} />

      <dl className="grid grid-cols-2 gap-x-3 gap-y-4 rounded-xl bg-tile p-4 text-sm">
        <Campo label="Organismo" value={p.organismo} wide />
        {p.bloque && <Campo label="Bloque" value={p.bloque} />}
        <Campo label="Partido o frente" value={p.partido ?? "No lo informa la fuente oficial"} muted={!p.partido} />
        {p.seccion && <Campo label="Electo por" value={p.seccion} />}
        {(p.mandatoDesde || p.mandatoHasta) && (
          <Campo label="Mandato" value={`${p.mandatoDesde ?? "?"}–${p.mandatoHasta ?? "?"}`} />
        )}
      </dl>

      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-semibold">Cuánto cobra</h4>
        {p.remuneracion.length > 0 ? (
          <>
            <ul className="flex flex-col gap-2 text-sm">
              {p.remuneracion.map((r) => (
                <li key={r.concepto} className="flex items-baseline justify-between gap-3">
                  <span className="text-ink-2">{r.concepto}</span>
                  <span className="font-medium whitespace-nowrap tabular-nums">{formatMoneda(r.monto, "ARS")}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-ink-muted">
              Montos brutos mensuales del cargo, vigentes a {p.remuneracion[0]!.periodo}.{" "}
              <a href={p.remuneracion[0]!.fuenteUrl} target="_blank" rel="noreferrer" className="text-link hover:underline">
                Fuente oficial
              </a>
            </p>
          </>
        ) : (
          <Aviso titulo="No está publicado">
            El sueldo de este cargo no figura en ningún sitio oficial.{" "}
            {pedido && (
              <Link to="/no-publicado" hash={pedido} className="font-medium text-link hover:underline">
                Pedilo con la Ley 9070 ›
              </Link>
            )}
          </Aviso>
        )}
      </section>

      <Declaracion persona={p} usd={usd} />

      {/diputados|senado/.test(p.grupo) && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Vote className="size-4 shrink-0" aria-hidden /> Próximamente: los proyectos que presentó y cómo votó.
        </p>
      )}

      <div className="flex flex-col gap-2 border-t border-line pt-4 text-sm">
        {p.email && (
          <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1.5 text-link hover:underline">
            <Mail className="size-4" aria-hidden /> {p.email}
          </a>
        )}
        {p.perfilUrl && (
          <a href={p.perfilUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-link hover:underline">
            Perfil oficial <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
        {p.fotoCredito && <span className="text-xs text-ink-muted">Foto: {p.fotoCredito}</span>}
        <a href={p.fuenteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-ink-muted hover:text-link hover:underline">
          <Landmark className="size-4" aria-hidden /> De dónde sale este dato <ExternalLink className="size-3.5" aria-hidden />
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
        className="group flex items-center gap-3 rounded-xl border border-line p-3 text-sm hover:border-link"
      >
        <Building2 className="size-4 shrink-0 text-ink-muted" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-ink-muted">Organismo que conduce o integra</span>
          <span className="truncate font-medium group-hover:text-link">{p.agency.name}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-ink-muted group-hover:text-link" aria-hidden />
      </Link>
    );
  }
  if (!p.municipalities.length) {
    const nacional = p.grupo === "diputados_nacional" || p.grupo === "senado_nacional";
    return (
      <p className="flex items-center gap-2 text-sm text-ink-2">
        <MapPin className="size-4 shrink-0 text-ink-muted" aria-hidden />
        {nacional ? "Representa a toda la provincia de Mendoza en el Congreso." : "Su cargo abarca toda la provincia."}{" "}
        <Link to="/municipios" className="whitespace-nowrap text-link hover:underline">
          Ver municipios ›
        </Link>
      </p>
    );
  }
  const intendente = p.grupo === "intendentes";
  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        <MapPin className="size-4 text-ink-muted" aria-hidden />
        {intendente ? "Gobierna" : `Representa a la ${p.seccion?.toLowerCase() ?? "sección"}`}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {p.municipalities.map((m) => (
          <li key={m.slug}>
            <Link
              to="/municipios/$slug"
              params={{ slug: m.slug }}
              className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-sm whitespace-nowrap hover:border-link hover:text-link"
            >
              {m.name} <ChevronRight className="size-3.5" aria-hidden />
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
      <h4 className="flex items-center gap-1.5 text-sm font-semibold">
        <FileText className="size-4 text-ink-muted" aria-hidden /> Qué declara
      </h4>
      {d ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 flex flex-col gap-0.5 rounded-lg bg-tile p-3">
              <span className="text-xs text-ink-muted">Inmuebles y vehículos a su nombre, en pesos a valor fiscal</span>
              <span className="text-lg font-semibold whitespace-nowrap tabular-nums">{millonesDePesos(d.totalBienes)}</span>
              {usd && d.totalBienes > 0 && (
                <span className="text-xs text-ink-muted">
                  Unos US$ {formatNumber(Math.round(d.totalBienes / usd.rate))} al dólar oficial de {formatMonth(usd.month)}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-0.5 rounded-lg bg-tile p-3">
              <span className="text-xs text-ink-muted">Inmuebles</span>
              <span className="font-medium tabular-nums">{d.inmuebles}</span>
            </div>
            <div className="flex flex-col gap-0.5 rounded-lg bg-tile p-3">
              <span className="text-xs text-ink-muted">Vehículos</span>
              <span className="font-medium tabular-nums">{d.rodados}</span>
            </div>
          </div>
          {d.declaredWithoutAmount.length > 0 && (
            <p className="text-sm text-ink-2 text-pretty">
              También declara {listaHumana(d.declaredWithoutAmount)}, pero el sitio oficial no publica esos montos.
            </p>
          )}
          <p className="text-xs text-ink-muted">
            Última declaración publicada{d.fecha ? ` el ${formatDate(d.fecha)}` : ""} ({d.declaracionesPublicadas}{" "}
            {d.declaracionesPublicadas === 1 ? "declaración" : "declaraciones"} en total).
          </p>
          <Aviso tipo="nota" titulo="Por qué el número parece bajo">
            El valor fiscal es el que usa el Estado para cobrar impuestos y suele estar muy por debajo del precio de mercado. Además,
            el total no incluye cuentas bancarias, efectivo, inversiones ni participaciones en empresas: la Oficina de Ética Pública
            muestra que se declaran, pero no cuánto.{" "}
            <Link to="/no-publicado" hash="ddjj-montos" className="font-medium text-link hover:underline">
              Pedí los montos ›
            </Link>
          </Aviso>
        </>
      ) : (
        <p className="text-sm text-ink-2">
          {nacional
            ? "Los legisladores nacionales presentan su declaración ante la Oficina Anticorrupción de la Nación."
            : "No encontramos su declaración publicada en la Oficina de Ética Pública."}
        </p>
      )}
      <a
        href={nacional ? "https://www.argentina.gob.ar/anticorrupcion" : ETICA}
        target="_blank"
        rel="noreferrer"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-link hover:underline"
      >
        {nacional ? "Oficina Anticorrupción" : "Ver en Ética Pública"} <ExternalLink className="size-3.5" aria-hidden />
      </a>
    </section>
  );
}

const listaHumana = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}`);
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const formatMonth = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`;

function Campo({ label, value, wide, muted }: { label: string; value: string; wide?: boolean; muted?: boolean }) {
  return (
    <div className={`flex flex-col gap-0.5 ${wide ? "col-span-2" : ""}`}>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className={`text-pretty ${muted ? "text-ink-muted" : ""}`}>{value}</dd>
    </div>
  );
}
