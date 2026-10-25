import { buttonClassName } from "@mt/ui/components/base/buttons/button";
import { Select, SelectItem } from "@mt/ui/components/base/select/select";
import { tileVariants } from "@mt/ui/components/card";
import { SectionTitle } from "@mt/ui/components/section";
import { Skeleton } from "@mt/ui/components/skeleton";
import { StatTile } from "@mt/ui/components/stat-tile";
import { cx } from "@mt/ui/lib/cx";
import { RiArrowLeftLine, RiCursorLine, RiDownloadLine, RiExternalLinkLine } from "@remixicon/react";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type ColumnaVista, columnasVisibles } from "@/celdas.ts";
import { useDetail } from "@/components/detail-sheet.tsx";
import { PanelDetalle } from "@/components/purchase-detail.tsx";
import { formatBytes, formatDate, formatNumber, humanize, loadPreview } from "@/lib.ts";
import type { DatasetMeta, Preview } from "@/types.ts";
import { useUrlText } from "@/url-state.ts";

const route = getRouteApi("/datos/$fuente");

export function DatosPage() {
  const { fuente } = route.useParams();
  const { sources, datasets } = route.useLoaderData();
  const source = sources.find((s) => s.id === fuente);
  const own = datasets.filter((d) => d.source === fuente);

  if (!source) {
    return (
      <p className="text-text-secondary">
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
        <Link to="/fuentes" className={buttonClassName({ variant: "tertiary", className: "w-fit" })}>
          <RiArrowLeftLine className="size-5" aria-hidden /> Fuentes
        </Link>
        <h1 className="text-display-4-semibold tracking-tight text-balance">{source.nombre}</h1>
        {source.descripcion && <p className="text-text-secondary text-pretty">{source.descripcion}</p>}
        <p className="text-body-regular text-text-tertiary">
          {source.organismo}
          {source.raw.lastFetch && <> · Descargado el {formatDate(source.raw.lastFetch)}</>}
          {source.url && (
            <>
              {" · "}
              <a href={source.url} className="inline-flex items-center gap-1 text-text-link hover:underline">
                Fuente oficial <RiExternalLinkLine className="size-4" aria-hidden />
              </a>
            </>
          )}
        </p>
      </div>

      {own.length === 0 ? (
        <p className="text-text-secondary">Esta fuente todavía no tiene datos procesados.</p>
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
  // The group shown (a year, an agency) lives in the URL with the table's name: /datos/lrf-personal?personal=2025.
  const tableName = dataset.file.replace(/\.csv$/, "");
  const [groupParam, setGroupParam] = useUrlText(tableName);
  const groupSlug = groups?.some((g) => g.slug === groupParam) ? groupParam : inicial?.slug;
  const setGroupSlug = (s: string) => setGroupParam(s === inicial?.slug ? null : s);
  const group = groups?.find((g) => g.slug === groupSlug);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const columnas = useMemo(() => columnasVisibles(dataset.columns, dict).filter((c) => c.key !== dict?.agruparPor), [dataset, dict]);
  const tieneMontos = Object.values(dict?.columnas ?? {}).some((c) => c.tipo === "moneda");
  const rowCount = group?.rowCount ?? dataset.rowCount;

  useEffect(() => {
    setPreview(null);
    setSelected(null);
    loadPreview(dataset.source, dataset.file, groupSlug).then(setPreview, (e: Error) => setError(e.message));
  }, [dataset.source, dataset.file, groupSlug]);

  const fila = selected !== null ? preview?.rows[selected] : undefined;
  const cerrar = useCallback(() => setSelected(null), []);
  const detail = useDetail();
  // Purchase processes and suppliers open in the URL-driven sheet (shareable: ?proceso= / ?proveedor=).
  const abrirFila = (i: number) => {
    const row = preview?.rows[i] ?? [];
    const col = (name: string) => row[dataset.columns.indexOf(name)] ?? "";
    if (dataset.detalle === "proceso" && col("ocid")) return detail.open("proceso", col("ocid"));
    if (dataset.detalle === "proveedor" && col("proveedor_cuit")) return detail.open("proveedor", col("proveedor_cuit"));
    setSelected(i === selected ? null : i);
  };

  return (
    <section id={tableName} className="flex scroll-mt-20 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex max-w-2xl flex-col gap-1">
          <SectionTitle id={tableName}>{dict?.titulo ?? humanize(dataset.file)}</SectionTitle>
          {dict?.descripcion && <p className="text-body-regular text-text-secondary text-pretty">{dict.descripcion}</p>}
          <p className="text-body-regular text-text-tertiary">
            {formatNumber(rowCount)} filas{group ? ` de ${group.value}` : ""} · CSV completo: {formatBytes(dataset.bytes)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {groups && groups.length > 1 && (
            <div className="flex min-w-0 items-center gap-2 text-body-regular text-text-secondary">
              <span id="datos-grupo-label">{columnaEtiqueta(dict, dict?.agruparPor)}</span>
              <Select
                aria-labelledby="datos-grupo-label"
                value={groupSlug}
                onChange={(key) => setGroupSlug(String(key))}
                className="min-w-0"
              >
                {groups.map((g) => (
                  <SelectItem key={g.slug} id={g.slug}>
                    {formatGrupo(g.value)}
                  </SelectItem>
                ))}
              </Select>
            </div>
          )}
          <a href={`/data/${dataset.source}/${dataset.file}`} download className={buttonClassName({ variant: "secondary" })}>
            <RiDownloadLine className="size-5" aria-hidden /> Descargar CSV
          </a>
        </div>
      </div>

      {error && <p className="text-body-regular text-text-secondary">{error}</p>}
      {!preview && !error && dict?.vista === "ultimo" && <p className="text-body-regular text-text-tertiary">Cargando…</p>}
      {/* The table's place while the rows load: header plus one 33 px row per row, up to the table's 32 rem. */}
      {!preview && !error && dict?.vista !== "ultimo" && (
        <Skeleton className="rounded-xl" style={{ height: `min(32rem, ${40 + Math.min(rowCount, 500) * 33}px)` }} />
      )}

      {preview && dict?.vista === "ultimo" && <UltimoDato columnas={columnas} fila={preview.rows[0]} />}

      {preview && dict?.vista !== "ultimo" && (
        <>
          <div className={cx(tileVariants(), "scroll-hint-x max-h-[32rem] overflow-auto p-0")}>
            <table className="w-full text-left text-body-regular tabular-nums">
              <thead className="sticky top-0 bg-background-surface text-text-tertiary shadow-[0_1px_0_var(--color-separator-border)]">
                <tr>
                  {columnas.map((c) => (
                    <th
                      key={c.key}
                      title={c.descripcion}
                      className={`whitespace-nowrap px-3 py-2 text-body-medium ${c.numerica ? "text-right" : ""} ${
                        c.descripcion ? "cursor-help underline decoration-dotted underline-offset-4" : ""
                      }`}
                    >
                      {c.etiqueta}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-separator-border">
                {preview.rows.map((row, i) => (
                  <tr
                    key={i}
                    onClick={() => abrirFila(i)}
                    aria-selected={i === selected}
                    className={`cursor-pointer ${i === selected ? "bg-chart-grid" : "hover:bg-background-secondary-default"}`}
                  >
                    {columnas.map((c) => {
                      const valor = c.formato(row[c.index] ?? "", row);
                      return (
                        <td
                          key={c.key}
                          className={`max-w-xs truncate whitespace-nowrap px-3 py-1.5 text-text-secondary ${c.numerica ? "text-right" : ""}`}
                        >
                          {c.url && row[c.index] ? (
                            <a
                              href={row[c.index]}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-text-link hover:underline"
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

      <p className="text-caption-1-regular text-text-tertiary">
        {dict?.vista !== "ultimo" && (
          <>
            <RiCursorLine className="mr-1 inline size-4 align-[-3px]" aria-hidden />
            Tocá una fila para ver el detalle.{" "}
          </>
        )}
        {preview && rowCount > preview.rows.length && (
          <>Mostrando las {formatNumber(preview.rows.length)} filas más recientes. Descargá el CSV para ver todo. </>
        )}
        {tieneMontos && <>Montos nominales, sin ajustar por inflación.</>}
      </p>
    </section>
  );
}

/** Tarjetas con la fila más reciente: para series donde importa el último dato, no el histórico. */
function UltimoDato({ columnas, fila }: { columnas: ColumnaVista[]; fila?: string[] }) {
  if (!fila) return null;
  const periodo = columnas.filter((c) => ["anio", "mes", "fecha"].includes(c.key) || /^fecha/.test(c.key));
  const valores = columnas.filter((c) => c.numerica && fila[c.index] !== "");
  const etiquetaPeriodo = periodo
    .map((c) => c.formato(fila[c.index] ?? "", fila))
    .reverse()
    .join(" ");
  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {valores.map((c) => (
          <StatTile key={c.key} label={c.etiqueta} value={c.formato(fila[c.index] ?? "", fila)} note={c.descripcion} />
        ))}
      </div>
      {etiquetaPeriodo && <p className="text-body-regular text-text-tertiary">Último dato: {etiquetaPeriodo}</p>}
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
