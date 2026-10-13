/** Enlaces a la fuente oficial y a la copia archivada: para que se vea de dónde sale cada dato. */

import { tileVariants } from "@mt/ui/components/card";
import { cx } from "@mt/ui/lib/cx";
import { RiArchiveLine, RiBankLine, RiExternalLinkLine } from "@remixicon/react";
import { useEffect, useState } from "react";

import { formatDate, loadIndex } from "@/lib.ts";
import type { DataIndex, SourceMeta } from "@/types.ts";

export const REPO = "https://github.com/unllamas/mendoza-transparente";
export const archivoUrl = (sourceId: string) => `${REPO}/tree/main/data/raw/${sourceId}`;

let indexPromise: Promise<DataIndex> | null = null;

/** Metadatos de las fuentes (organismo, URL oficial, última descarga), con el índice cacheado. */
export function useFuentes(ids: string[]): SourceMeta[] {
  const [fuentes, setFuentes] = useState<SourceMeta[]>([]);
  const key = ids.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the stable form of `ids` (a new array on every render).
  useEffect(() => {
    indexPromise ??= loadIndex();
    indexPromise.then((index) => setFuentes(ids.map((id) => index.sources.find((s) => s.id === id)).filter((s) => s !== undefined)));
  }, [key]);
  return fuentes;
}

/** Línea de fuentes debajo del título de una página temática. */
export function FuentesOficiales({ ids }: { ids: string[] }) {
  const fuentes = useFuentes(ids);
  if (fuentes.length === 0) return null;
  return (
    <div className={cx(tileVariants({ size: "sm" }), "flex flex-col gap-3 text-body-regular")}>
      {fuentes.map((s) => (
        <div key={s.id} className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
          <span className="flex items-start gap-1.5 text-text-secondary">
            <RiBankLine className="mt-0.5 size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
            <span>
              Fuente: <span className="text-text-primary">{s.organismo || s.nombre}</span>
            </span>
          </span>
          {s.url && (
            <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-text-link hover:underline">
              Ver en el sitio oficial <RiExternalLinkLine className="size-3.5" aria-hidden />
            </a>
          )}
          <a
            href={archivoUrl(s.id)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-text-tertiary hover:text-text-primary hover:underline"
          >
            <RiArchiveLine className="size-3.5" aria-hidden /> Copia archivada
            {s.raw.lastFetch && <> del {formatDate(s.raw.lastFetch)}</>}
          </a>
        </div>
      ))}
    </div>
  );
}
