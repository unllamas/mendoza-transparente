import { getRouteApi, Link } from "@tanstack/react-router";
import { ChevronRight, ExternalLink, FileText, Landmark, Mail, Search, Vote } from "lucide-react";
import { useMemo, useState } from "react";

import { BarList } from "../charts/bar-list.tsx";
import { formatMoneda } from "../celdas.ts";
import { formatDate } from "../lib.ts";
import { FuentesOficiales } from "../fuente.tsx";
import type { Funcionario, GrupoFuncionario } from "../types.ts";
import { PageHeader, Segmented, Sheet } from "./components.tsx";

const route = getRouteApi("/funcionarios");

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
  const [abierto, setAbierto] = useState<Funcionario | null>(null);

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
        <Lista titulo={`${visibles.length} resultados`} personas={visibles} onOpen={setAbierto} />
      ) : (
        grupos.map((g) => {
          const delGrupo = visibles.filter((p) => p.grupo === g);
          return (
            <div key={g} className="flex flex-col gap-4">
              {(g === "diputados_provincial" || g === "senado_provincial") && <Bloques personas={delGrupo} />}
              <Lista titulo={`${NOMBRE_GRUPO[g]} (${delGrupo.length})`} personas={delGrupo} onOpen={setAbierto} />
            </div>
          );
        })
      )}

      {abierto && <FichaSheet persona={abierto} onClose={() => setAbierto(null)} />}
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

function Lista({ titulo, personas, onOpen }: { titulo: string; personas: Funcionario[]; onOpen: (p: Funcionario) => void }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{titulo}</h2>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl bg-tile">
        {personas.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onOpen(p)}
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
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Foto oficial si existe; si no, las iniciales. */
function Avatar({ persona: p, className }: { persona: Funcionario; className: string }) {
  const [error, setError] = useState(false);
  if (p.foto && !error) {
    return (
      <img
        src={p.foto}
        alt=""
        loading="lazy"
        onError={() => setError(true)}
        className={`shrink-0 rounded-full bg-grid object-cover ${className}`}
      />
    );
  }
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-grid font-medium text-ink-2 ${className}`} aria-hidden>
      {iniciales(p.nombre)}
    </span>
  );
}

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter((w) => /^\p{Lu}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("");

function FichaSheet({ persona: p, onClose }: { persona: Funcionario; onClose: () => void }) {
  const pedido = PEDIDO_SUELDO[p.grupo];
  return (
    <Sheet titulo="Ficha" onClose={onClose}>
      <div className="flex items-center gap-3">
        <Avatar persona={p} className="size-16 text-base" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="text-xl font-semibold tracking-tight text-balance">{p.nombre}</h3>
          <span className="text-sm text-ink-2">{p.cargo}</span>
          {p.nota && <span className="text-sm text-ink-muted">{p.nota}</span>}
        </div>
      </div>

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
          <p className="text-sm text-ink-2">
            No está publicado.{" "}
            {pedido && (
              <Link to="/no-publicado" hash={pedido} className="font-medium text-link hover:underline">
                Pedilo con la Ley 9070 ›
              </Link>
            )}
          </p>
        )}
      </section>

      <Declaracion persona={p} />

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
    </Sheet>
  );
}

const ETICA = "https://eticapublica.mendoza.gov.ar/declaraciones";

function Declaracion({ persona: p }: { persona: Funcionario }) {
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
              <span className="text-xs text-ink-muted">Bienes declarados, a valor fiscal</span>
              <span className="text-lg font-semibold tabular-nums">{formatMoneda(d.totalBienes, "ARS")}</span>
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
          <p className="text-xs text-ink-muted text-pretty">
            Última declaración publicada{d.fecha ? ` el ${formatDate(d.fecha)}` : ""} ({d.declaracionesPublicadas}{" "}
            {d.declaracionesPublicadas === 1 ? "declaración" : "declaraciones"} en total). El valor fiscal suele ser bastante menor
            que el de mercado. El sitio oficial solo permite ver la última declaración y no informa montos de cuentas,
            deudas ni ingresos.
          </p>
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

function Campo({ label, value, wide, muted }: { label: string; value: string; wide?: boolean; muted?: boolean }) {
  return (
    <div className={`flex flex-col gap-0.5 ${wide ? "col-span-2" : ""}`}>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className={`text-pretty ${muted ? "text-ink-muted" : ""}`}>{value}</dd>
    </div>
  );
}
