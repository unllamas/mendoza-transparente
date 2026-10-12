import { getRouteApi, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { columnasVisibles } from "../celdas.ts";
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
        <Link to="/fuentes" className="underline">
          Ver todas las fuentes
        </Link>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-12">
      <div className="flex max-w-2xl flex-col gap-3">
        <Link to="/fuentes" className="text-sm text-ink-muted hover:text-ink">
          ← Fuentes
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">{source.nombre}</h1>
        {source.descripcion && <p className="text-ink-2 text-pretty">{source.descripcion}</p>}
        <p className="text-sm text-ink-muted">
          {source.organismo}
          {source.raw.lastFetch && <> · Descargado el {formatDate(source.raw.lastFetch)}</>}
          {source.url && (
            <>
              {" · "}
              <a href={source.url} className="text-accent hover:underline">
                Fuente oficial ↗
              </a>
            </>
          )}
        </p>
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
  const columnas = useMemo(() => columnasVisibles(dataset.columns, dataset.dict), [dataset]);
  const tieneMillones = dataset.dict && Object.values(dataset.dict.columnas ?? {}).some((c) => c.tipo === "moneda");

  useEffect(() => {
    loadPreview(dataset.source, dataset.file).then(setPreview, (e: Error) => setError(e.message));
  }, [dataset.source, dataset.file]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex max-w-2xl flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">{dataset.dict?.titulo ?? humanize(dataset.file)}</h2>
          {dataset.dict?.descripcion && <p className="text-sm text-ink-2 text-pretty">{dataset.dict.descripcion}</p>}
          <p className="text-sm text-ink-muted">
            {formatNumber(dataset.rowCount)} filas · {formatBytes(dataset.bytes)}
          </p>
        </div>
        <a
          href={`/data/${dataset.source}/${dataset.file}`}
          download
          className="whitespace-nowrap rounded-lg border border-line px-3 py-1.5 text-sm hover:border-axis"
        >
          Descargar CSV
        </a>
      </div>

      <div className="max-h-[28rem] overflow-auto rounded-xl bg-tile">
        {error && <p className="p-4 text-sm text-ink-2">{error}</p>}
        {!preview && !error && <p className="p-4 text-sm text-ink-muted">Cargando…</p>}
        {preview && (
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
                <tr key={i}>
                  {columnas.map((c) => {
                    const valor = c.formato(row[c.index] ?? "", row);
                    return (
                      <td
                        key={c.key}
                        title={valor}
                        className={`max-w-xs truncate whitespace-nowrap px-3 py-1.5 text-ink-2 ${c.numerica ? "text-right" : ""}`}
                      >
                        {valor}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-ink-muted">
        {preview && dataset.rowCount > preview.rows.length && (
          <>Mostrando las primeras {formatNumber(preview.rows.length)} filas. Descargá el CSV para ver todo. </>
        )}
        {tieneMillones && <>M = millones. Montos en valores nominales, sin ajustar por inflación.</>}
      </p>
    </section>
  );
}
