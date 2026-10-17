/** Enlaces a la fuente oficial, a la copia archivada y a la copia en archive.org: para que se vea de dónde sale cada dato. */

import { listRowVariants, listVariants } from "@mt/ui/components/card";
import { Section } from "@mt/ui/components/section";
import { SkeletonText } from "@mt/ui/components/skeleton";
import { cx } from "@mt/ui/lib/cx";
import { RiArchiveLine, RiExternalLinkLine } from "@remixicon/react";
import { useEffect, useState } from "react";

import { formatDate, loadSources } from "@/lib.ts";
import type { SourceCatalog, SourceMeta } from "@/types.ts";

export const REPO = "https://github.com/unllamas/mendoza-transparente";
export const archivoUrl = (sourceId: string) => `${REPO}/tree/main/data/raw/${sourceId}`;

/** The sources catalog (fuentes.json), loaded once and shared; `null` while it loads. Third-layer data: never blocks a page. */
export function useSourceCatalog(): SourceCatalog | null {
  const [catalog, setCatalog] = useState<SourceCatalog | null>(null);
  useEffect(() => {
    loadSources().then(setCatalog, () => {});
  }, []);
  return catalog;
}

/** Metadatos de las fuentes (organismo, URL oficial, última descarga); `null` mientras cargan. */
export function useFuentes(ids: string[]): SourceMeta[] | null {
  const catalog = useSourceCatalog();
  if (!catalog) return null;
  return ids.map((id) => catalog.sources.find((s) => s.id === id)).filter((s) => s !== undefined);
}

const LINK = "inline-flex min-h-11 items-center gap-1 text-text-link hover:underline sm:min-h-0";

/**
 * "Fuentes" section, always last on the page: who publishes each piece of data, a link to the official site and to
 * our archived copy. Few people open it, but it is how anyone can check that what we show is right.
 */
export function FuentesOficiales({ ids }: { ids: string[] }) {
  const fuentes = useFuentes(ids);
  if (fuentes?.length === 0) return null;
  return (
    <Section id="fuentes" title="Fuentes">
      <p className="-mt-2 max-w-2xl text-body-regular text-text-tertiary text-pretty">
        De dónde sale cada dato de esta página. Guardamos una copia de lo que descargamos, por si el original cambia o se borra.
      </p>
      <ul className={listVariants()}>
        {/* While the catalog loads, one row per source keeps the section's height: the page does not move when it arrives. */}
        {fuentes === null &&
          ids.map((id) => (
            <li key={id} className={cx(listRowVariants({ interactive: false }), "flex-col items-start gap-1 sm:flex-row sm:items-center")}>
              <SkeletonText className="w-2/3 sm:w-1/3" />
              <SkeletonText className="w-1/2 sm:ml-auto sm:w-1/4" />
            </li>
          ))}
        {fuentes?.map((s) => (
          <li
            key={s.id}
            className={cx(
              listRowVariants({ interactive: false }),
              "flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
            )}
          >
            <span className="text-body-regular text-text-primary text-pretty">{s.organismo || s.nombre}</span>
            <span className="flex shrink-0 flex-wrap gap-x-4 text-body-regular">
              {s.url && (
                <a href={s.url} target="_blank" rel="noreferrer" className={LINK}>
                  Sitio oficial <RiExternalLinkLine className="size-3.5" aria-hidden />
                </a>
              )}
              <a href={archivoUrl(s.id)} target="_blank" rel="noreferrer" className={LINK}>
                <RiArchiveLine className="size-3.5" aria-hidden />
                {s.raw.lastFetch ? `Copia del ${formatDate(s.raw.lastFetch)}` : "Copia archivada"}
              </a>
              {s.archiveOrg && (
                <a href={s.archiveOrg} target="_blank" rel="noreferrer" className={LINK}>
                  <RiArchiveLine className="size-3.5" aria-hidden /> archive.org
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
