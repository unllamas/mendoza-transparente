/** Enlaces a la fuente oficial y a la copia archivada: para que se vea de dónde sale cada dato. */

import { Archive, ExternalLink, Landmark } from "lucide-react";
import { useEffect, useState } from "react";

import { formatDate, loadIndex } from "./lib.ts";
import type { DataIndex, SourceMeta } from "./types.ts";

export const REPO = "https://github.com/unllamas/mendoza-transparente";
export const archivoUrl = (sourceId: string) => `${REPO}/tree/main/data/raw/${sourceId}`;

let indexPromise: Promise<DataIndex> | null = null;

/** Metadatos de las fuentes (organismo, URL oficial, última descarga), con el índice cacheado. */
export function useFuentes(ids: string[]): SourceMeta[] {
  const [fuentes, setFuentes] = useState<SourceMeta[]>([]);
  const key = ids.join(",");
  useEffect(() => {
    indexPromise ??= loadIndex();
    indexPromise.then((index) => setFuentes(ids.map((id) => index.sources.find((s) => s.id === id)).filter((s) => s !== undefined)));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return fuentes;
}

/** Línea de fuentes debajo del título de una página temática. */
export function FuentesOficiales({ ids }: { ids: string[] }) {
  const fuentes = useFuentes(ids);
  if (fuentes.length === 0) return null;
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-tile px-4 py-3 text-sm">
      {fuentes.map((s) => (
        <div key={s.id} className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
          <span className="flex items-start gap-1.5 text-ink-2">
            <Landmark className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
            <span>
              Fuente: <span className="text-ink">{s.organismo || s.nombre}</span>
            </span>
          </span>
          {s.url && (
            <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">
              Ver en el sitio oficial <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
          <a
            href={archivoUrl(s.id)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-ink-muted hover:text-ink hover:underline"
          >
            <Archive className="size-3.5" aria-hidden /> Copia archivada
            {s.raw.lastFetch && <> del {formatDate(s.raw.lastFetch)}</>}
          </a>
        </div>
      ))}
    </div>
  );
}
