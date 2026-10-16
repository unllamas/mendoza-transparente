import { Chip } from "@mt/ui/components/base/badges/chip";
import { cardVariants, listRowVariants, listVariants, tileVariants } from "@mt/ui/components/card";
import { cx } from "@mt/ui/lib/cx";
/** Panel lateral con el detalle de una fila y, en compras, los datos relacionados. */

import { Alert } from "@mt/ui/components/alert";
import { Button } from "@mt/ui/components/base/buttons/button";
import { Popover, PopoverContent, PopoverTrigger } from "@mt/ui/components/popover";
import {
  RiAlertLine,
  RiArchiveLine,
  RiArrowLeftLine,
  RiArrowRightSLine,
  RiBankLine,
  RiBuilding2Line,
  RiCalendarLine,
  RiExternalLinkLine,
  RiFileTextLine,
  RiInformationLine,
  RiSearchLine,
  RiUserLine,
} from "@remixicon/react";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";

import { type ColumnaVista, formatMoneda } from "@/celdas.ts";
import { ColumnChart } from "@/charts/column-chart.tsx";
import { formatDate, formatNumber, limpiarOrganismo, loadJson } from "@/lib.ts";
import { procesoShard } from "@/shard.ts";
import type { DatasetMeta, OrganismoResumen, ProcesoDetalle, ProveedorDetalle } from "@/types.ts";
import { archivoUrl, useFuentes } from "./official-sources.tsx";
import { TrackedSegmented } from "./tracked-segmented.tsx";
import { TrackedSheet } from "./tracked-sheet.tsx";

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: start over when another row is opened.
  useEffect(() => setHistorial([inicial]), [fila]);

  return (
    <TrackedSheet
      title="Detalle"
      onClose={onClose}
      trackId="data.row"
      header={
        historial.length > 1 && (
          <Button variant="secondary" leadingIcon={RiArrowLeftLine} className="w-fit" onClick={() => setHistorial((h) => h.slice(0, -1))}>
            Volver
          </Button>
        )
      }
    >
      {vista.tipo === "proveedor" && <Proveedor cuit={vista.cuit} onProceso={(ocid) => ir({ tipo: "proceso", ocid })} />}
      {vista.tipo === "proceso" && <Proceso ocid={vista.ocid} onProveedor={(cuit) => ir({ tipo: "proveedor", cuit })} />}
      {historial.length === 1 && <CamposFila columnas={columnas} fila={fila} titulo={vista.tipo === "fila" ? undefined : "Esta fila"} />}
      <OrigenDato dataset={dataset} fila={fila} ocid={vista.tipo === "proceso" ? vista.ocid : undefined} />
    </TrackedSheet>
  );
}

/** De dónde sale el dato: la fuente oficial, el documento de la fila si existe, nuestra copia archivada y la de archive.org. */
function OrigenDato({ dataset, fila, ocid }: { dataset: DatasetMeta; fila: string[]; ocid?: string }) {
  const [fuente] = useFuentes([dataset.source]);
  const urlFila = ["url_pdf", "fuente_url", "url"].map((c) => fila[dataset.columns.indexOf(c)]).find((v) => v && /^https?:\/\//.test(v));
  const esCompra = dataset.source === "compras-ocds";

  return (
    <section className={cx(tileVariants(), "flex flex-col gap-2 text-body-regular")}>
      <h4 className="flex items-center gap-1.5 text-body-semibold">
        <RiBankLine className="size-4 text-foreground-icon-secondary" aria-hidden /> De dónde sale este dato
      </h4>
      {fuente && <p className="text-text-secondary">{fuente.organismo || fuente.nombre}</p>}
      <div className="flex flex-col gap-1.5">
        {urlFila && (
          <a href={urlFila} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-text-link hover:underline">
            <RiFileTextLine className="size-4" aria-hidden /> Documento original <RiExternalLinkLine className="size-4" aria-hidden />
          </a>
        )}
        {esCompra && ocid && (
          <a
            href="https://comprar.mendoza.gov.ar/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-text-link hover:underline"
          >
            <RiSearchLine className="size-4" aria-hidden /> Buscar el proceso {ocid.replace(/^ocds-ppv9mm-/, "")} en COMPR.AR{" "}
            <RiExternalLinkLine className="size-4" aria-hidden />
          </a>
        )}
        {fuente?.url && (
          <a href={fuente.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-text-link hover:underline">
            <RiBankLine className="size-4" aria-hidden /> Sitio oficial de la fuente <RiExternalLinkLine className="size-4" aria-hidden />
          </a>
        )}
        <a
          href={archivoUrl(dataset.source)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-text-tertiary hover:text-text-primary hover:underline"
        >
          <RiArchiveLine className="size-4" aria-hidden /> Copia archivada del archivo original
        </a>
        {fuente?.archiveOrg && (
          <a
            href={fuente.archiveOrg}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-text-tertiary hover:text-text-primary hover:underline"
          >
            <RiArchiveLine className="size-4" aria-hidden /> Copia en archive.org
          </a>
        )}
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
            <dt className="text-caption-1-regular text-text-tertiary">{c.etiqueta}</dt>
            <dd className="text-body-regular break-words">
              {c.url && fila[c.index] ? (
                <a href={fila[c.index]} target="_blank" rel="noreferrer" className="text-text-link hover:underline">
                  {c.formato(fila[c.index]!, fila)}
                </a>
              ) : (
                c.formato(fila[c.index] ?? "", fila)
              )}
            </dd>
            {c.descripcion && <dd className="text-caption-1-regular text-text-tertiary text-pretty">{c.descripcion}</dd>}
          </div>
        ))}
      </dl>
    </Bloque>
  );
}

function useCarga<T>(path: string, pick?: (data: unknown) => T | undefined) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload only when the file changes; `pick` is a new function on every render.
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
  }, [path]);
  return { data, error };
}

export function Proveedor({ cuit, onProceso, sinTitulo }: { cuit: string; onProceso: (ocid: string) => void; sinTitulo?: boolean }) {
  const { data: p, error } = useCarga<ProveedorDetalle>(`temas/compras/proveedores/${cuit}.json`);
  // Agencies with their own page (the ones with enough processes), by their name in the purchase data.
  const { data: agencies } = useCarga<OrganismoResumen[]>("temas/organismos.json");
  const agencySlug = new Map((agencies ?? []).map((a) => [a.buyer, a.slug]));
  if (error) return <p className="text-body-regular text-text-secondary">No hay más datos de este proveedor.</p>;
  if (!p) return <p className="text-body-regular text-text-tertiary">Cargando proveedor…</p>;

  return (
    <>
      {!sinTitulo && (
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-caption-1-regular text-text-tertiary">
            <RiBuilding2Line className="size-4" aria-hidden /> Proveedor · CUIT {cuit}
          </span>
          <h3 className="text-title-3-semibold tracking-tight text-balance">{p.empresa?.razonSocial ?? p.nombre}</h3>
        </div>
      )}

      <QuienEs proveedor={p} />

      <div className="grid grid-cols-2 gap-2">
        <Dato label="Total adjudicado" value={formatMoneda(p.total, "ARS")} />
        <Dato label="Procesos ganados" value={formatNumber(p.procesos)} />
        <Dato label="Primera adjudicación" value={p.primera ? formatDate(p.primera) : "—"} />
        <Dato label="Última adjudicación" value={p.ultima ? formatDate(p.ultima) : "—"} />
      </div>

      {p.porAnio.length > 1 && (
        <Bloque titulo={p.referenciaReal ? `Adjudicado por año, en pesos de ${p.referenciaReal}` : "Adjudicado por año"}>
          <ColumnChart
            columnas={p.porAnio.map((a) => ({
              etiqueta: String(a.anio),
              valor: a.real,
              detalle: p.referenciaReal ? `${formatMoneda(a.monto, "ARS")} nominales` : undefined,
            }))}
            formatValue={(v) => formatMoneda(v, "ARS")}
            ariaLabel={`Monto adjudicado por año a ${p.nombre}`}
          />
        </Bloque>
      )}

      <Bloque titulo="Quién le compra" ayuda={agencySlug.size ? "Tocá un organismo para ver todo lo que compra" : undefined}>
        <ul className="flex flex-col gap-1 text-body-regular">
          {p.organismos.map((o) => {
            const to = agencySlug.get(o.nombre);
            const body = (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className={`min-w-0 flex-1 truncate ${to ? "text-text-link" : ""}`} title={o.nombre}>
                    {limpiarOrganismo(o.nombre)}
                  </span>
                  <span className="text-body-medium whitespace-nowrap tabular-nums">{formatMoneda(o.monto, "ARS")}</span>
                  {to && <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />}
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 flex-1 rounded-full bg-chart-grid/60">
                    <span
                      className="block h-full rounded-full bg-highlight"
                      style={{ width: `${Math.max((o.monto / p.organismos[0]!.monto) * 100, 1)}%` }}
                    />
                  </span>
                  <span className="w-20 text-right text-caption-1-regular text-text-tertiary tabular-nums">
                    {o.procesos} {o.procesos === 1 ? "proceso" : "procesos"}
                  </span>
                  {to && <span className="size-4 shrink-0" aria-hidden />}
                </div>
              </>
            );
            return (
              <li key={o.nombre}>
                {to ? (
                  <Link
                    to="/organismos/$slug"
                    params={{ slug: to }}
                    data-track="purchase.supplier.agency_open"
                    className="-mx-2 flex min-h-11 flex-col justify-center gap-1 rounded-lg px-2 py-2 hover:bg-background-secondary-default"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex flex-col gap-1 py-2">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </Bloque>

      <Bloque titulo="Adjudicaciones recientes" ayuda="Tocá una para ver el proceso completo">
        <ul className={listVariants()}>
          {p.recientes.map((r, i) => (
            <li key={r.ocid + i}>
              <button type="button" onClick={() => onProceso(r.ocid)} className={listRowVariants()}>
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="line-clamp-2 text-body-regular text-pretty group-hover:text-text-link">{r.titulo || "Sin título"}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-caption-1-regular text-text-tertiary">
                    {r.fecha && (
                      <Chip variant="caption" color="soft" className="tabular-nums">
                        <RiCalendarLine aria-hidden /> {formatDate(r.fecha)}
                      </Chip>
                    )}
                    <span>{r.metodo}</span>
                  </span>
                </span>
                <span className="text-body-medium whitespace-nowrap tabular-nums">{formatMoneda(r.monto, "ARS")}</span>
                <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
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
      <p className={cx(tileVariants({ size: "sm" }), "flex items-start gap-2 text-body-regular text-text-secondary")}>
        <RiUserLine className="mt-0.5 size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
        Persona humana que vende al Estado a título individual. Por privacidad no mostramos más datos personales.
      </p>
    );
  }
  const nombre = e?.razonSocial ?? p.nombre;
  return (
    <Bloque titulo="Quién es">
      {e ? (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-body-regular">
          {e.tipoSocietario && <Campo label="Tipo de sociedad" value={e.tipoSocietario} />}
          {e.fechaConstitucion && <Campo label="Constituida" value={formatDate(e.fechaConstitucion)} />}
          {e.localidad && <Campo label="Domicilio" value={e.localidad} />}
          {e.actividad && <Campo label="Actividad" value={e.actividad} wide />}
        </dl>
      ) : (
        <p className="text-body-regular text-text-tertiary">No figura en el Registro Nacional de Sociedades.</p>
      )}
      {e?.mesesHastaPrimeraAdjudicacion !== null &&
        e?.mesesHastaPrimeraAdjudicacion !== undefined &&
        e.mesesHastaPrimeraAdjudicacion < 12 && (
          <Alert title="Empresa recién creada">
            Ganó su primera adjudicación a los {e.mesesHastaPrimeraAdjudicacion} {e.mesesHastaPrimeraAdjudicacion === 1 ? "mes" : "meses"}{" "}
            de constituida. No es una irregularidad en sí, pero es un patrón que los organismos de control miran de cerca.
          </Alert>
        )}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-body-regular">
        <a
          href={ARCA_CONSTANCIA}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-text-link hover:underline"
        >
          Constancia de CUIT en ARCA <RiExternalLinkLine className="size-4" aria-hidden />
        </a>
        <a
          href={`https://duckduckgo.com/?q=${encodeURIComponent(`"${nombre}" Mendoza`)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-text-link hover:underline"
        >
          <RiSearchLine className="size-4" aria-hidden /> Buscar en la web <RiExternalLinkLine className="size-4" aria-hidden />
        </a>
      </div>
      <p className="text-caption-1-regular text-text-tertiary">
        Fuente: Registro Nacional de Sociedades (Ministerio de Justicia, con datos de ARCA).
      </p>
    </Bloque>
  );
}

function Campo({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`flex flex-col gap-0.5 ${wide ? "col-span-2" : ""}`}>
      <dt className="text-caption-1-regular text-text-tertiary">{label}</dt>
      <dd className="text-pretty">{value}</dd>
    </div>
  );
}

const ESTADO_PROCESO: Record<string, string> = {
  active: "En curso",
  complete: "Finalizado",
  unsuccessful: "Desierto o fracasado",
};

type Orden = "mayor" | "menor" | "nombre";
const ORDENES: { value: Orden; label: string }[] = [
  { value: "mayor", label: "Mayor monto" },
  { value: "menor", label: "Menor monto" },
  { value: "nombre", label: "A–Z" },
];

export function Proceso({ ocid, onProveedor }: { ocid: string; onProveedor: (cuit: string) => void }) {
  const [orden, setOrden] = useState<Orden>("mayor");
  const { data: p, error } = useCarga<ProcesoDetalle>(
    `temas/compras/procesos/${procesoShard(ocid)}.json`,
    (d) => (d as Record<string, ProcesoDetalle>)[ocid],
  );
  if (error) return <p className="text-body-regular text-text-secondary">No encontramos este proceso.</p>;
  if (!p) return <p className="text-body-regular text-text-tertiary">Cargando proceso…</p>;
  const total = p.adjudicaciones.reduce((s, a) => s + a.monto, 0);
  const ordenadas = [...p.adjudicaciones].sort((a, b) =>
    orden === "nombre" ? a.proveedor.localeCompare(b.proveedor, "es") : orden === "menor" ? a.monto - b.monto : b.monto - a.monto,
  );

  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-1.5 text-caption-1-regular text-text-tertiary">
          <RiFileTextLine className="size-4" aria-hidden /> Proceso de compra · N.º {ocid.replace(/^ocds-ppv9mm-/, "")}
        </span>
        <h3 className="text-title-3-semibold tracking-tight text-pretty">{p.titulo}</h3>
        <span className="text-body-regular text-text-secondary" title={p.comprador}>
          {limpiarOrganismo(p.comprador)}
        </span>
      </div>

      <Flags flags={processFlags(p, total)} />

      <div className="grid grid-cols-2 gap-2">
        <Dato label="Modalidad" value={p.metodo} />
        <Dato label="Estado" value={ESTADO_PROCESO[p.estado] ?? p.estado} />
        <Dato label="Fecha" value={formatDate(p.fecha)} />
        <Dato label="Ofertas recibidas" value={p.oferentes === null ? "—" : formatNumber(p.oferentes)} />
      </div>

      <Montos estimado={p.montoEstimado} adjudicado={p.adjudicaciones.length ? total : null} />

      {p.oferentes === 1 && p.adjudicaciones.length === 1 ? (
        <Bloque titulo="Ganó sin competencia" ayuda="Fue la única oferta: se llevó todo el monto adjudicado.">
          <button
            type="button"
            onClick={() => onProveedor(p.adjudicaciones[0]!.cuit)}
            data-track="purchase.winner.open"
            className={cx(cardVariants(), "flex items-center gap-3")}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-background-secondary-default text-foreground-icon-secondary">
              <RiBuilding2Line className="size-5" aria-hidden />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-body-medium text-pretty text-text-link">{p.adjudicaciones[0]!.proveedor}</span>
              <Amount value={p.adjudicaciones[0]!.monto} />
            </span>
            <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
          </button>
        </Bloque>
      ) : (
        <Bloque
          titulo={p.adjudicaciones.length ? "Adjudicado a" : "Sin adjudicaciones"}
          ayuda={p.adjudicaciones.length ? "Tocá un proveedor para ver su perfil" : undefined}
        >
          {p.adjudicaciones.length > 3 && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-body-regular text-text-secondary tabular-nums">
                {formatNumber(p.adjudicaciones.length)} adjudicaciones · {formatMoneda(total, "ARS")}
              </span>
              <TrackedSegmented label="Ordenar" options={ORDENES} value={orden} onChange={setOrden} trackId="purchase.awards_sort" />
            </div>
          )}
          <ul className={listVariants()}>
            {ordenadas.map((a, i) => (
              <li key={a.cuit + i}>
                <button type="button" onClick={() => onProveedor(a.cuit)} className={cx(listRowVariants(), "text-body-regular")}>
                  <RiBuilding2Line className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
                  <span className="min-w-0 flex-1 group-hover:text-text-link">{a.proveedor}</span>
                  <span className="text-body-medium whitespace-nowrap tabular-nums">{formatMoneda(a.monto, "ARS")}</span>
                  <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </Bloque>
      )}
    </>
  );
}

/** A big amount with its unit apart and smaller: "$ 1.673" + "millones". */
function Amount({ value }: { value: number }) {
  const millions = Math.abs(value) >= 1e6;
  const n = millions ? value / 1e6 : value;
  return (
    <span className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-title-2-semibold tabular-nums">
        $ {formatNumber(millions && Math.abs(n) < 100 ? Math.round(n * 10) / 10 : Math.round(n))}
      </span>
      {millions && <span className="text-body-regular text-text-tertiary">millones</span>}
    </span>
  );
}

interface Flag {
  id: string;
  label: string;
  text: string;
}

/** What stands out in a purchase process, as short labels; each one expands to a two-line explanation. */
function processFlags(p: ProcesoDetalle, awarded: number): Flag[] {
  const flags: Flag[] = [];
  const estimate = p.montoEstimado ?? 0;
  if (estimate > 0 && awarded > 0) {
    const ratio = awarded / estimate;
    if (estimate < SYMBOLIC_ESTIMATE && awarded >= 100 * estimate)
      flags.push({
        id: "estimado-simbolico",
        label: "Estimado simbólico",
        text: `Se cargó ${formatMoneda(estimate, "ARS")} como estimado. Sin un estimado real no se puede controlar si el precio fue razonable.`,
      });
    else if (ratio >= 2)
      flags.push({
        id: "sobre-estimado",
        label: `+${formatNumber(Math.round((ratio - 1) * 100))} % sobre lo estimado`,
        text: "Puede haber una explicación (error de carga, cambio de alcance, precios que subieron), pero un desvío así merece una respuesta del organismo.",
      });
  }
  if (p.oferentes === 1)
    flags.push({ id: "una-oferta", label: "Una sola oferta", text: "Sin competencia, el Estado no pudo comparar precios." });
  if (/directa/i.test(p.metodo) && awarded >= 10_000_000)
    flags.push({
      id: "directa",
      label: "Contratación directa",
      text: "Sin licitación pública. La ley la permite en casos puntuales; en montos grandes conviene saber por qué.",
    });
  return flags;
}

function Flags({ flags }: { flags: Flag[] }) {
  if (!flags.length) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Para mirar de cerca">
      {flags.map((f) => (
        <li key={f.id}>
          <Popover>
            <PopoverTrigger
              data-track="purchase.flag.toggle"
              data-track-flag={f.id}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-2lg border border-warning-border bg-warning-background/60 px-3.5 text-body-medium whitespace-nowrap hover:border-warning-foreground aria-expanded:border-warning-foreground aria-expanded:bg-warning-background"
            >
              <RiAlertLine className="size-4 text-warning-foreground" aria-hidden />
              {f.label}
              <RiInformationLine className="size-4 text-foreground-icon-secondary" aria-hidden />
            </PopoverTrigger>
            <PopoverContent className="border-warning-border">{f.text}</PopoverContent>
          </Popover>
        </li>
      ))}
    </ul>
  );
}

/** Estimado contra adjudicado: dos barras en la misma escala y la diferencia en porcentaje. */
function Montos({ estimado, adjudicado }: { estimado: number | null; adjudicado: number | null }) {
  if (!estimado && !adjudicado) return null;
  const max = Math.max(estimado ?? 0, adjudicado ?? 0);
  const filas = [
    { label: "Estimado", valor: estimado },
    { label: "Adjudicado", valor: adjudicado },
  ];
  return (
    <Bloque titulo="Montos">
      <ul className="flex flex-col gap-2.5">
        {filas.map((f) => (
          <li key={f.label} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-body-regular">
              <span className="text-text-secondary">{f.label}</span>
              <span className="text-body-medium tabular-nums">{f.valor ? formatMoneda(f.valor, "ARS") : "—"}</span>
            </div>
            <div className="h-2.5 rounded-full bg-chart-grid/60">
              {f.valor ? (
                <div className="h-full rounded-full bg-highlight" style={{ width: `${Math.max((f.valor / max) * 100, 1)}%` }} />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {estimado && adjudicado && <Desvio estimado={estimado} adjudicado={adjudicado} />}
      {estimado && !adjudicado && <p className="text-body-regular text-text-secondary">No se adjudicó.</p>}
    </Bloque>
  );
}

/** Below this, an estimate is symbolic ($1, $2…): the agency did not really estimate the price. */
const SYMBOLIC_ESTIMATE = 1000;

/** Difference between estimate and award, as a percentage ("un 526.100 % más de lo estimado"). */
function Desvio({ estimado, adjudicado }: { estimado: number; adjudicado: number }) {
  const ratio = adjudicado / estimado;
  const pct = Math.abs(ratio - 1) * 100;
  if (pct < 0.5) return <p className="text-body-regular text-text-secondary">Se adjudicó lo mismo que se estimó.</p>;
  if (estimado < SYMBOLIC_ESTIMATE && adjudicado >= 100 * estimado)
    return <p className="text-body-regular text-text-secondary">El estimado cargado es simbólico: no permite comparar.</p>;
  return (
    <p className="text-body-regular text-text-secondary">
      Se adjudicó un {formatNumber(Math.round(pct))} % {ratio > 1 ? "más" : "menos"} de lo estimado.
    </p>
  );
}

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div className={cx(tileVariants({ size: "sm" }), "flex flex-col gap-0.5")}>
      <span className="text-caption-1-regular text-text-tertiary">{label}</span>
      <span className="text-body-medium tabular-nums">{value}</span>
    </div>
  );
}

function Bloque({ titulo, ayuda, children }: { titulo?: string; ayuda?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      {titulo && (
        <div className="flex flex-col gap-0.5">
          <h4 className="text-body-semibold">{titulo}</h4>
          {ayuda && <span className="text-caption-1-regular text-text-tertiary">{ayuda}</span>}
        </div>
      )}
      {children}
    </section>
  );
}
