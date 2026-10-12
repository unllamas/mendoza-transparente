/** Panel lateral con el detalle de una fila y, en compras, los datos relacionados. */

import {
  Archive,
  ArrowLeft,
  Building2,
  CalendarDays,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  Landmark,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { formatMoneda, type ColumnaVista } from "../celdas.ts";
import { archivoUrl, useFuentes } from "../fuente.tsx";
import { formatDate, formatNumber, limpiarOrganismo, loadJson } from "../lib.ts";
import { procesoShard } from "../shard.ts";
import type { DatasetMeta, ProcesoDetalle, ProveedorDetalle } from "../types.ts";

type Vista = { tipo: "fila" } | { tipo: "proveedor"; cuit: string } | { tipo: "proceso"; ocid: string };

export function PanelDetalle({
  dataset,
  columnas,
  fila,
  onClose,
}: {
  dataset: DatasetMeta;
  columnas: ColumnaVista[];
  fila: string[];
  onClose: () => void;
}) {
  const col = (name: string) => fila[dataset.columns.indexOf(name)] ?? "";
  const inicial: Vista =
    dataset.detalle === "proveedor" && col("proveedor_cuit")
      ? { tipo: "proveedor", cuit: col("proveedor_cuit") }
      : dataset.detalle === "proceso"
        ? { tipo: "proceso", ocid: col("ocid") }
        : { tipo: "fila" };
  const [historial, setHistorial] = useState<Vista[]>([inicial]);
  const vista = historial.at(-1)!;
  const ir = (v: Vista) => setHistorial((h) => [...h, v]);

  useEffect(() => setHistorial([inicial]), [fila]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hoja modal: Escape cierra y la página de fondo no se desplaza mientras está abierta.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <>
      <div aria-hidden onClick={onClose} className="fixed inset-0 z-30 bg-black/50 backdrop-blur-[1px]" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Detalle"
        className="fixed inset-y-0 right-0 z-40 flex w-full flex-col overflow-hidden border-l border-line bg-surface shadow-2xl sm:w-[30rem]"
      >
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        {historial.length > 1 && (
          <button
            type="button"
            onClick={() => setHistorial((h) => h.slice(0, -1))}
            className="rounded-md px-2 py-1 text-sm text-ink-2 hover:bg-grid hover:text-ink"
          >
            <ArrowLeft className="mr-1 inline size-4 align-[-3px]" aria-hidden />
            Volver
          </button>
        )}
        <span className="mr-auto text-sm font-medium">Detalle</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar detalle"
          className="rounded-md px-2 py-1 text-sm text-ink-2 hover:bg-grid hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="flex flex-col gap-6 overflow-y-auto p-4">
        {vista.tipo === "proveedor" && <Proveedor cuit={vista.cuit} onProceso={(ocid) => ir({ tipo: "proceso", ocid })} />}
        {vista.tipo === "proceso" && <Proceso ocid={vista.ocid} onProveedor={(cuit) => ir({ tipo: "proveedor", cuit })} />}
        {historial.length === 1 && <CamposFila columnas={columnas} fila={fila} titulo={vista.tipo === "fila" ? undefined : "Esta fila"} />}
        <OrigenDato dataset={dataset} fila={fila} ocid={vista.tipo === "proceso" ? vista.ocid : undefined} />
      </div>
      </aside>
    </>
  );
}

/** De dónde sale el dato: la fuente oficial, el documento de la fila si existe y nuestra copia archivada. */
function OrigenDato({ dataset, fila, ocid }: { dataset: DatasetMeta; fila: string[]; ocid?: string }) {
  const [fuente] = useFuentes([dataset.source]);
  const urlFila = ["url_pdf", "fuente_url", "url"]
    .map((c) => fila[dataset.columns.indexOf(c)])
    .find((v) => v && /^https?:\/\//.test(v));
  const esCompra = dataset.source === "compras-ocds";

  return (
    <section className="flex flex-col gap-2 rounded-xl bg-tile p-4 text-sm">
      <h4 className="flex items-center gap-1.5 font-semibold">
        <Landmark className="size-4 text-ink-muted" aria-hidden /> De dónde sale este dato
      </h4>
      {fuente && <p className="text-ink-2">{fuente.organismo || fuente.nombre}</p>}
      <div className="flex flex-col gap-1.5">
        {urlFila && (
          <a href={urlFila} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-link hover:underline">
            <FileText className="size-3.5" aria-hidden /> Documento original <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
        {esCompra && ocid && (
          <a
            href="https://comprar.mendoza.gov.ar/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-link hover:underline"
          >
            <Search className="size-3.5" aria-hidden /> Buscar el proceso {ocid.replace(/^ocds-ppv9mm-/, "")} en COMPR.AR{" "}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
        {fuente?.url && (
          <a href={fuente.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-link hover:underline">
            <Landmark className="size-3.5" aria-hidden /> Sitio oficial de la fuente <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
        <a
          href={archivoUrl(dataset.source)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-ink-muted hover:text-ink hover:underline"
        >
          <Archive className="size-3.5" aria-hidden /> Copia archivada del archivo original
        </a>
      </div>
    </section>
  );
}

function CamposFila({ columnas, fila, titulo }: { columnas: ColumnaVista[]; fila: string[]; titulo?: string }) {
  return (
    <Bloque titulo={titulo}>
      <dl className="flex flex-col gap-3">
        {columnas.map((c) => (
          <div key={c.key} className="flex flex-col gap-0.5">
            <dt className="text-xs text-ink-muted">{c.etiqueta}</dt>
            <dd className="text-sm break-words">
              {c.url && fila[c.index] ? (
                <a href={fila[c.index]} target="_blank" rel="noreferrer" className="text-link hover:underline">
                  {c.formato(fila[c.index]!, fila)}
                </a>
              ) : (
                c.formato(fila[c.index] ?? "", fila)
              )}
            </dd>
            {c.descripcion && <dd className="text-xs text-ink-muted text-pretty">{c.descripcion}</dd>}
          </div>
        ))}
      </dl>
    </Bloque>
  );
}

function useCarga<T>(path: string, pick?: (data: unknown) => T | undefined) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    setData(null);
    setError(false);
    loadJson<unknown>(path).then(
      (d) => {
        const v = pick ? pick(d) : (d as T);
        if (v) setData(v);
        else setError(true);
      },
      () => setError(true),
    );
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error };
}

function Proveedor({ cuit, onProceso }: { cuit: string; onProceso: (ocid: string) => void }) {
  const { data: p, error } = useCarga<ProveedorDetalle>(`temas/compras/proveedores/${cuit}.json`);
  if (error) return <p className="text-sm text-ink-2">No hay más datos de este proveedor.</p>;
  if (!p) return <p className="text-sm text-ink-muted">Cargando proveedor…</p>;
  const maxAnio = Math.max(...p.porAnio.map((a) => a.monto));

  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-1.5 text-xs text-ink-muted">
          <Building2 className="size-3.5" aria-hidden /> Proveedor · CUIT {cuit}
        </span>
        <h3 className="text-lg font-semibold tracking-tight text-balance">{p.empresa?.razonSocial ?? p.nombre}</h3>
      </div>

      <QuienEs proveedor={p} />

      <div className="grid grid-cols-2 gap-2">
        <Dato label="Total adjudicado" value={formatMoneda(p.total, "ARS")} />
        <Dato label="Procesos ganados" value={formatNumber(p.procesos)} />
        <Dato label="Primera adjudicación" value={p.primera ? formatDate(p.primera) : "—"} />
        <Dato label="Última adjudicación" value={p.ultima ? formatDate(p.ultima) : "—"} />
      </div>

      <Bloque titulo="Por año">
        <ul className="flex flex-col gap-2">
          {p.porAnio.map((a) => (
            <li key={a.anio} className="grid grid-cols-[3rem_1fr_auto] items-center gap-2 text-sm tabular-nums">
              <span className="text-ink-2">{a.anio}</span>
              <span className="h-2 rounded-full bg-grid/60">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max((a.monto / maxAnio) * 100, 1)}%` }} />
              </span>
              <span>{formatMoneda(a.monto, "ARS")}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-ink-muted">Montos nominales, sin ajustar por inflación.</p>
      </Bloque>

      <Bloque titulo="Quién le compra">
        <ul className="flex flex-col gap-3 text-sm">
          {p.organismos.map((o) => (
            <li key={o.nombre} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate" title={o.nombre}>
                  {limpiarOrganismo(o.nombre)}
                </span>
                <span className="font-medium whitespace-nowrap tabular-nums">{formatMoneda(o.monto, "ARS")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-1.5 flex-1 rounded-full bg-grid/60">
                  <span
                    className="block h-full rounded-full bg-accent"
                    style={{ width: `${Math.max((o.monto / p.organismos[0]!.monto) * 100, 1)}%` }}
                  />
                </span>
                <span className="w-20 text-right text-xs text-ink-muted tabular-nums">
                  {o.procesos} {o.procesos === 1 ? "proceso" : "procesos"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Bloque>

      <Bloque titulo="Adjudicaciones recientes" ayuda="Tocá una para ver el proceso completo">
        <ul className="flex flex-col divide-y divide-line">
          {p.recientes.map((r, i) => (
            <li key={r.ocid + i}>
              <button
                type="button"
                onClick={() => onProceso(r.ocid)}
                className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-tile"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="line-clamp-2 text-sm text-pretty group-hover:text-link">{r.titulo || "Sin título"}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                    {r.fecha && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-tile px-1.5 py-0.5 tabular-nums group-hover:bg-grid">
                        <CalendarDays className="size-3" aria-hidden /> {formatDate(r.fecha)}
                      </span>
                    )}
                    <span>{r.metodo}</span>
                  </span>
                </span>
                <span className="text-sm font-medium whitespace-nowrap tabular-nums">{formatMoneda(r.monto, "ARS")}</span>
                <ChevronRight className="size-4 shrink-0 text-ink-muted group-hover:text-link" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </Bloque>
    </>
  );
}

const ARCA_CONSTANCIA = "https://seti.afip.gob.ar/padron-puc-constancia-internet/ConsultaConstanciaAction.do";

/** Quién es el proveedor según el Registro Nacional de Sociedades. A las personas humanas no se las perfila. */
function QuienEs({ proveedor: p }: { proveedor: ProveedorDetalle }) {
  const e = p.empresa;
  if (e?.tipoPersona === "humana") {
    return (
      <p className="flex items-start gap-2 rounded-xl bg-tile p-3 text-sm text-ink-2">
        <UserRound className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
        Persona humana que vende al Estado a título individual. Por privacidad no mostramos más datos personales.
      </p>
    );
  }
  const nombre = e?.razonSocial ?? p.nombre;
  return (
    <Bloque titulo="Quién es">
      {e ? (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
          {e.tipoSocietario && <Campo label="Tipo de sociedad" value={e.tipoSocietario} />}
          {e.fechaConstitucion && <Campo label="Constituida" value={formatDate(e.fechaConstitucion)} />}
          {e.localidad && <Campo label="Domicilio" value={e.localidad} />}
          {e.actividad && <Campo label="Actividad" value={e.actividad} wide />}
        </dl>
      ) : (
        <p className="text-sm text-ink-muted">No figura en el Registro Nacional de Sociedades.</p>
      )}
      {e?.mesesHastaPrimeraAdjudicacion !== null && e?.mesesHastaPrimeraAdjudicacion !== undefined && e.mesesHastaPrimeraAdjudicacion < 12 && (
        <p className="flex items-start gap-2 rounded-xl bg-tile p-3 text-sm text-ink-2">
          <Clock className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
          Ganó su primera adjudicación a los {e.mesesHastaPrimeraAdjudicacion}{" "}
          {e.mesesHastaPrimeraAdjudicacion === 1 ? "mes" : "meses"} de constituida.
        </p>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
        <a href={ARCA_CONSTANCIA} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-link hover:underline">
          Constancia de CUIT en ARCA <ExternalLink className="size-3" aria-hidden />
        </a>
        <a
          href={`https://duckduckgo.com/?q=${encodeURIComponent(`"${nombre}" Mendoza`)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-link hover:underline"
        >
          <Search className="size-3.5" aria-hidden /> Buscar en la web <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>
      <p className="text-xs text-ink-muted">Fuente: Registro Nacional de Sociedades (Ministerio de Justicia, con datos de ARCA).</p>
    </Bloque>
  );
}

function Campo({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`flex flex-col gap-0.5 ${wide ? "col-span-2" : ""}`}>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="text-pretty">{value}</dd>
    </div>
  );
}

const ESTADO_PROCESO: Record<string, string> = {
  active: "En curso",
  complete: "Finalizado",
  unsuccessful: "Desierto o fracasado",
};

function Proceso({ ocid, onProveedor }: { ocid: string; onProveedor: (cuit: string) => void }) {
  const { data: p, error } = useCarga<ProcesoDetalle>(
    `temas/compras/procesos/${procesoShard(ocid)}.json`,
    (d) => (d as Record<string, ProcesoDetalle>)[ocid],
  );
  if (error) return <p className="text-sm text-ink-2">No encontramos este proceso.</p>;
  if (!p) return <p className="text-sm text-ink-muted">Cargando proceso…</p>;
  const total = p.adjudicaciones.reduce((s, a) => s + a.monto, 0);

  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-1.5 text-xs text-ink-muted">
          <FileText className="size-3.5" aria-hidden /> Proceso de compra · N.º {ocid.replace(/^ocds-ppv9mm-/, "")}
        </span>
        <h3 className="text-lg font-semibold tracking-tight text-pretty">{p.titulo}</h3>
        <span className="text-sm text-ink-2" title={p.comprador}>
          {limpiarOrganismo(p.comprador)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Dato label="Modalidad" value={p.metodo} />
        <Dato label="Estado" value={ESTADO_PROCESO[p.estado] ?? p.estado} />
        <Dato label="Fecha" value={formatDate(p.fecha)} />
        <Dato label="Ofertas recibidas" value={p.oferentes === null ? "—" : formatNumber(p.oferentes)} />
        <Dato label="Monto estimado" value={p.montoEstimado ? formatMoneda(p.montoEstimado, "ARS") : "—"} />
        <Dato label="Monto adjudicado" value={p.adjudicaciones.length ? formatMoneda(total, "ARS") : "—"} />
      </div>

      <Bloque
        titulo={p.adjudicaciones.length ? "Adjudicado a" : "Sin adjudicaciones"}
        ayuda={p.adjudicaciones.length ? "Tocá un proveedor para ver su perfil" : undefined}
      >
        <ul className="flex flex-col divide-y divide-line">
          {p.adjudicaciones.map((a, i) => (
            <li key={a.cuit + i}>
              <button
                type="button"
                onClick={() => onProveedor(a.cuit)}
                className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm hover:bg-tile"
              >
                <Building2 className="size-4 shrink-0 text-ink-muted" aria-hidden />
                <span className="min-w-0 flex-1 group-hover:text-link">{a.proveedor}</span>
                <span className="font-medium whitespace-nowrap tabular-nums">{formatMoneda(a.monto, "ARS")}</span>
                <ChevronRight className="size-4 shrink-0 text-ink-muted group-hover:text-link" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        {p.oferentes === 1 && (
          <p className="text-xs text-ink-muted">Este proceso recibió una sola oferta.</p>
        )}
      </Bloque>
    </>
  );
}

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-tile p-3">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}

function Bloque({ titulo, ayuda, children }: { titulo?: string; ayuda?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      {titulo && (
        <div className="flex flex-col gap-0.5">
          <h4 className="text-sm font-semibold">{titulo}</h4>
          {ayuda && <span className="text-xs text-ink-muted">{ayuda}</span>}
        </div>
      )}
      {children}
    </section>
  );
}
