import { Link, getRouteApi } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { formatBytes, formatDate, formatNumber, humanize, loadPreview } from "../lib.ts";
import type { DatasetMeta, Preview } from "../types.ts";

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
        <Link to="/" className="underline">
          Volver al inicio
        </Link>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex max-w-2xl flex-col gap-2">
        <Link to="/" className="text-sm text-ink-muted hover:text-ink">
          ← Inicio
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">{source.nombre}</h1>
        <p className="text-ink-2">
          {source.organismo}
          {source.raw.lastFetch && ` · Descargado el ${formatDate(source.raw.lastFetch)}`}
        </p>
        {source.url && (
          <a href={source.url} className="text-sm text-accent hover:underline">
            Ver la fuente oficial ↗
          </a>
        )}
      </div>

      {own.length === 0 ? (
        <p className="text-ink-2">Esta fuente todavía no tiene datos procesados.</p>
      ) : (
        own.map((d) => <DatasetView key={d.file} dataset={d} />)
      )}
    </div>
  );
}

function DatasetView({ dataset }: { dataset: DatasetMeta }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPreview(dataset.source, dataset.file).then(setPreview, (e: Error) => setError(e.message));
  }, [dataset.source, dataset.file]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{humanize(dataset.file)}</h2>
        <span className="text-sm text-ink-muted">
          {formatNumber(dataset.rowCount)} registros · {dataset.columns.length} columnas · {formatBytes(dataset.bytes)}
        </span>
        <a
          href={`/data/${dataset.source}/${dataset.file}`}
          download
          className="ml-auto text-sm text-accent hover:underline"
        >
          Descargar CSV
        </a>
      </div>

      <div className="max-h-[28rem] overflow-auto rounded-xl border border-line bg-surface">
        {error && <p className="p-4 text-sm text-ink-2">{error}</p>}
        {!preview && !error && <p className="p-4 text-sm text-ink-muted">Cargando…</p>}
        {preview && (
          <table className="w-full text-left text-sm tabular-nums">
            <thead className="sticky top-0 border-b border-line bg-surface text-ink-muted">
              <tr>
                {preview.columns.map((c) => (
                  <th key={c} className="whitespace-nowrap px-3 py-2 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {preview.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className="max-w-xs truncate whitespace-nowrap px-3 py-1.5 text-ink-2" title={cell}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {preview && dataset.rowCount > preview.rows.length && (
        <p className="text-xs text-ink-muted">
          Mostrando las primeras {formatNumber(preview.rows.length)} filas. Descargá el CSV para ver todo.
        </p>
      )}
    </section>
  );
}
