import { getRouteApi, Link } from "@tanstack/react-router";
import { ArrowLeft, Download, ExternalLink, MousePointerClick } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { columnasVisibles, type ColumnaVista } from "../celdas.ts";
import { formatBytes, formatDate, formatNumber, humanize, loadPreview } from "../lib.ts";
import type { DatasetMeta, Preview } from "../types.ts";
import { StatTile } from "./components.tsx";
import { PanelDetalle } from "./detalle.tsx";

const route = getRouteApi("/datos/$fuente");

export function DatosPage() {
  const { fuente } = route.useParams();
  const { sources, datasets } = route.useLoaderData();
  const source = sources.find((s) => s.id === fuente);
  const own = datasets.filter((d) => d.source === fuente);

  if (!source) {
    return (
      <p className="text-ink-2">
        No encontramos esa fuente.{" "}
        <Link to="/fuentes" className="underline">
          Ver todas las fuentes
        </Link>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-12">
      <div className="flex max-w-2xl flex-col gap-3">
        <Link to="/fuentes" className="flex w-fit items-center gap-1 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> Fuentes
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">{source.nombre}</h1>
        {source.descripcion && <p className="text-ink-2 text-pretty">{source.descripcion}</p>}
        <p className="text-sm text-ink-muted">
          {source.organismo}
          {source.raw.lastFetch && <> · Descargado el {formatDate(source.raw.lastFetch)}</>}
          {source.url && (
            <>
              {" · "}
              <a href={source.url} className="inline-flex items-center gap-1 text-accent hover:underline">
                Fuente oficial <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </>
          )}
        </p>
      </div>

      {own.length === 0 ? (
        <p className="text-ink-2">Esta fuente todavía no tiene datos procesados.</p>
      ) : (
        // Primero lo informativo (tarjetas de último dato), después las tablas crudas.
        [...own]
          .sort((a, b) => Number(b.dict?.vista === "ultimo") - Number(a.dict?.vista === "ultimo"))
          .map((d) => <DatasetView key={d.file} dataset={d} />)
      )}
    </div>
  );
}

function DatasetView({ dataset }: { dataset: DatasetMeta }) {
  const dict = dataset.dict;
  const groups = dataset.groups;
  const inicial = groups?.find((g) => g.value === dict?.grupoInicial) ?? groups?.[0];
  const [groupSlug, setGroupSlug] = useState(inicial?.slug);
  const group = groups?.find((g) => g.slug === groupSlug);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const columnas = useMemo(
    () => columnasVisibles(dataset.columns, dict).filter((c) => c.key !== dict?.agruparPor),
    [dataset, dict],
  );
  const tieneMontos = Object.values(dict?.columnas ?? {}).some((c) => c.tipo === "moneda");
  const rowCount = group?.rowCount ?? dataset.rowCount;

  useEffect(() => {
    setPreview(null);
    setSelected(null);
    loadPreview(dataset.source, dataset.file, groupSlug).then(setPreview, (e: Error) => setError(e.message));
  }, [dataset.source, dataset.file, groupSlug]);

  const fila = selected !== null ? preview?.rows[selected] : undefined;
  const cerrar = useCallback(() => setSelected(null), []);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex max-w-2xl flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">{dict?.titulo ?? humanize(dataset.file)}</h2>
          {dict?.descripcion && <p className="text-sm text-ink-2 text-pretty">{dict.descripcion}</p>}
          <p className="text-sm text-ink-muted">
            {formatNumber(rowCount)} filas{group ? ` de ${group.value}` : ""} · CSV completo: {formatBytes(dataset.bytes)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {groups && groups.length > 1 && (
            <label className="flex items-center gap-2 text-sm text-ink-2">
              <span>{columnaEtiqueta(dict, dict?.agruparPor)}</span>
              <select
                value={groupSlug}
                onChange={(e) => setGroupSlug(e.target.value)}
                className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink hover:border-axis"
              >
                {groups.map((g) => (
                  <option key={g.slug} value={g.slug}>
                    {formatGrupo(g.value)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <a
            href={`/data/${dataset.source}/${dataset.file}`}
            download
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-line px-3 py-1.5 text-sm hover:border-axis"
          >
            <Download className="size-4" aria-hidden /> Descargar CSV
          </a>
        </div>
      </div>

      {error && <p className="text-sm text-ink-2">{error}</p>}
      {!preview && !error && <p className="text-sm text-ink-muted">Cargando…</p>}

      {preview && dict?.vista === "ultimo" && <UltimoDato columnas={columnas} fila={preview.rows[0]} />}

      {preview && dict?.vista !== "ultimo" && (
        <>
          <div className="max-h-[32rem] overflow-auto rounded-xl bg-tile">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="sticky top-0 bg-tile text-ink-muted shadow-[0_1px_0_var(--border)]">
                <tr>
                  {columnas.map((c) => (
                    <th
                      key={c.key}
                      title={c.descripcion}
                      className={`whitespace-nowrap px-3 py-2 font-medium ${c.numerica ? "text-right" : ""} ${
                        c.descripcion ? "cursor-help underline decoration-dotted underline-offset-4" : ""
                      }`}
                    >
                      {c.etiqueta}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {preview.rows.map((row, i) => (
                  <tr
                    key={i}
                    onClick={() => setSelected(i === selected ? null : i)}
                    aria-selected={i === selected}
                    className={`cursor-pointer ${i === selected ? "bg-grid" : "hover:bg-grid/50"}`}
                  >
                    {columnas.map((c) => {
                      const valor = c.formato(row[c.index] ?? "", row);
                      return (
                        <td
                          key={c.key}
                          className={`max-w-xs truncate whitespace-nowrap px-3 py-1.5 text-ink-2 ${c.numerica ? "text-right" : ""}`}
                        >
                          {c.url && row[c.index] ? (
                            <a
                              href={row[c.index]}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-accent hover:underline"
                            >
                              {valor}
                            </a>
                          ) : (
                            valor
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {fila && <PanelDetalle dataset={dataset} columnas={columnas} fila={fila} onClose={cerrar} />}
        </>
      )}

      <p className="text-xs text-ink-muted">
        {dict?.vista !== "ultimo" && (
          <>
            <MousePointerClick className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
            Tocá una fila para ver el detalle.{" "}
          </>
        )}
        {preview && rowCount > preview.rows.length && (
          <>Mostrando las {formatNumber(preview.rows.length)} filas más recientes. Descargá el CSV para ver todo. </>
        )}
        {tieneMontos && <>M = millones; mil M = miles de millones. Montos nominales, sin ajustar por inflación.</>}
      </p>
    </section>
  );
}

/** Tarjetas con la fila más reciente: para series donde importa el último dato, no el histórico. */
function UltimoDato({ columnas, fila }: { columnas: ColumnaVista[]; fila?: string[] }) {
  if (!fila) return null;
  const periodo = columnas.filter((c) => ["anio", "mes", "fecha"].includes(c.key) || /^fecha/.test(c.key));
  const valores = columnas.filter((c) => c.numerica && fila[c.index] !== "");
  const etiquetaPeriodo = periodo.map((c) => c.formato(fila[c.index] ?? "", fila)).reverse().join(" ");
  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {valores.map((c) => (
          <StatTile key={c.key} label={c.etiqueta} value={c.formato(fila[c.index] ?? "", fila)} note={c.descripcion} />
        ))}
      </div>
      {etiquetaPeriodo && <p className="text-sm text-ink-muted">Último dato: {etiquetaPeriodo}</p>}
    </div>
  );
}

function columnaEtiqueta(dict: DatasetMeta["dict"], key?: string) {
  return (key && dict?.columnas?.[key]?.etiqueta) ?? "Grupo";
}

/** "MENDOZA" → "Mendoza", "cuyo" → "Cuyo" */
function formatGrupo(value: string) {
  if (value === value.toUpperCase() || value === value.toLowerCase()) {
    return value.toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
  }
  return value;
}
