/** Panel lateral con el detalle de una fila y, en compras, los datos relacionados. */

import { useEffect, useState, type ReactNode } from "react";

import { formatMoneda, type ColumnaVista } from "../celdas.ts";
import { formatDate, formatNumber, loadJson } from "../lib.ts";
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
            ← Volver
          </button>
        )}
        <span className="mr-auto text-sm font-medium">Detalle</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar detalle"
          className="rounded-md px-2 py-1 text-sm text-ink-2 hover:bg-grid hover:text-ink"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col gap-6 overflow-y-auto p-4">
        {vista.tipo === "proveedor" && <Proveedor cuit={vista.cuit} onProceso={(ocid) => ir({ tipo: "proceso", ocid })} />}
        {vista.tipo === "proceso" && <Proceso ocid={vista.ocid} onProveedor={(cuit) => ir({ tipo: "proveedor", cuit })} />}
        {historial.length === 1 && <CamposFila columnas={columnas} fila={fila} titulo={vista.tipo === "fila" ? undefined : "Esta fila"} />}
      </div>
      </aside>
    </>
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
                <a href={fila[c.index]} target="_blank" rel="noreferrer" className="text-accent hover:underline">
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
        <span className="text-xs text-ink-muted">Proveedor · CUIT {cuit}</span>
        <h3 className="text-lg font-semibold tracking-tight text-balance">{p.nombre}</h3>
      </div>

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
        <ul className="flex flex-col gap-2 text-sm">
          {p.organismos.map((o) => (
            <li key={o.nombre} className="flex justify-between gap-3">
              <span className="text-ink-2">{o.nombre}</span>
              <span className="whitespace-nowrap tabular-nums">{formatMoneda(o.monto, "ARS")}</span>
            </li>
          ))}
        </ul>
      </Bloque>

      <Bloque titulo="Adjudicaciones recientes">
        <ul className="flex flex-col divide-y divide-line">
          {p.recientes.map((r, i) => (
            <li key={r.ocid + i}>
              <button
                type="button"
                onClick={() => onProceso(r.ocid)}
                className="flex w-full flex-col gap-0.5 py-2 text-left hover:text-accent"
              >
                <span className="text-sm text-pretty">{r.titulo || "Sin título"}</span>
                <span className="text-xs text-ink-muted tabular-nums">
                  {r.fecha ? `${formatDate(r.fecha)} · ` : ""}
                  {r.metodo} · {formatMoneda(r.monto, "ARS")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Bloque>
    </>
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
        <span className="text-xs text-ink-muted">Proceso de compra · N.º {ocid.replace(/^ocds-ppv9mm-/, "")}</span>
        <h3 className="text-lg font-semibold tracking-tight text-pretty">{p.titulo}</h3>
        <span className="text-sm text-ink-2">{p.comprador}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Dato label="Modalidad" value={p.metodo} />
        <Dato label="Estado" value={ESTADO_PROCESO[p.estado] ?? p.estado} />
        <Dato label="Fecha" value={formatDate(p.fecha)} />
        <Dato label="Ofertas recibidas" value={p.oferentes === null ? "—" : formatNumber(p.oferentes)} />
        <Dato label="Monto estimado" value={p.montoEstimado ? formatMoneda(p.montoEstimado, "ARS") : "—"} />
        <Dato label="Monto adjudicado" value={p.adjudicaciones.length ? formatMoneda(total, "ARS") : "—"} />
      </div>

      <Bloque titulo={p.adjudicaciones.length ? "Adjudicado a" : "Sin adjudicaciones"}>
        <ul className="flex flex-col divide-y divide-line">
          {p.adjudicaciones.map((a, i) => (
            <li key={a.cuit + i}>
              <button
                type="button"
                onClick={() => onProveedor(a.cuit)}
                className="flex w-full items-baseline justify-between gap-3 py-2 text-left text-sm hover:text-accent"
              >
                <span>{a.proveedor}</span>
                <span className="whitespace-nowrap tabular-nums">{formatMoneda(a.monto, "ARS")}</span>
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

function Bloque({ titulo, children }: { titulo?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      {titulo && <h4 className="text-sm font-semibold">{titulo}</h4>}
      {children}
    </section>
  );
}
