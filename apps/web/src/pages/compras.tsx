import { Alert } from "@mt/ui/components/alert";
import { Button } from "@mt/ui/components/base/buttons/button";
import { listRowVariants, listVariants } from "@mt/ui/components/card";
import { PageHeader, Section } from "@mt/ui/components/section";
import { StatTile } from "@mt/ui/components/stat-tile";
import {
  RiArrowRightSLine,
  RiBankLine,
  RiBuilding2Line,
  RiFileTextLine,
  RiGroupLine,
  RiPercentLine,
  RiReceiptLine,
} from "@remixicon/react";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { formatMoneda } from "@/celdas.ts";
import { ProportionBar } from "@/charts/bar-list.tsx";
import { ColumnChart } from "@/charts/column-chart.tsx";
import { Breadcrumbs, WithBreadcrumbs } from "@/components/breadcrumbs.tsx";
import { useDetail } from "@/components/detail-sheet.tsx";
import { EntityColumns } from "@/components/entity-columns.tsx";
import { ListSearch } from "@/components/list-search.tsx";
import { FuentesOficiales } from "@/components/official-sources.tsx";
import { Proveedor } from "@/components/purchase-detail.tsx";
import { ShareButton } from "@/components/share-button.tsx";
import { formatDate, formatNumber, limpiarOrganismo, normalizeText } from "@/lib.ts";
import { slugProveedor } from "@/slug.ts";
import { useUrlText } from "@/url-state.ts";

const FUENTES = ["compras-ocds", "proveedores"];
const PAGINA = 40;
const pct = (v: number) => `${Math.round(v)} %`;

const proveedoresRoute = getRouteApi("/proveedores");
const proveedorRoute = getRouteApi("/proveedores/$slug");
const organismosRoute = getRouteApi("/organismos");
const organismoRoute = getRouteApi("/organismos/$slug");

const VerMas = ({ onClick }: { onClick: () => void }) => (
  <Button variant="secondary" className="w-fit" onClick={onClick}>
    Ver más
  </Button>
);

export function ProveedoresPage() {
  const proveedores = proveedoresRoute.useLoaderData();
  const [q, setQ] = useUrlText("q");
  const [mostrar, setMostrar] = useState(PAGINA);
  const visibles = useMemo(() => {
    const n = normalizeText(q.trim());
    return n ? proveedores.filter((p) => normalizeText(`${p.nombre} ${p.cuit}`).includes(n)) : proveedores;
  }, [proveedores, q]);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader action={<ShareButton />} icon={RiBuilding2Line} topic="Proveedores" title="¿A quiénes les compra el Estado?">
        Las empresas que más le vendieron al Gobierno de Mendoza, ordenadas por lo que se les adjudicó.
      </PageHeader>
      <div className="flex flex-col gap-4">
        <ListSearch
          value={q}
          onChange={(v) => {
            setQ(v);
            setMostrar(PAGINA);
          }}
          placeholder="Buscar por nombre o CUIT"
          label="Buscar proveedor"
        />
        <p className="text-body-regular text-text-tertiary">{formatNumber(visibles.length)} proveedores</p>
        <ul className={listVariants()}>
          {visibles.slice(0, mostrar).map((p) => (
            <li key={p.slug}>
              <Link to="/proveedores/$slug" params={{ slug: p.slug }} className={listRowVariants()}>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-body-medium group-hover:text-text-link" title={p.nombre}>
                    {p.nombre}
                  </span>
                  <span className="truncate text-body-regular text-text-tertiary">
                    {formatNumber(p.procesos)} {p.procesos === 1 ? "proceso" : "procesos"}
                    {p.localidad ? ` · ${p.localidad}` : ""}
                  </span>
                </span>
                <span className="text-body-medium whitespace-nowrap tabular-nums">{formatMoneda(p.total, "ARS")}</span>
                <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
        {mostrar < visibles.length && <VerMas onClick={() => setMostrar((n) => n + PAGINA)} />}
      </div>

      <FuentesOficiales ids={FUENTES} />
    </div>
  );
}

export function ProveedorPage() {
  const { ficha, cuit } = proveedorRoute.useLoaderData();
  const { slug } = proveedorRoute.useParams();
  const navigate = useNavigate();
  const detail = useDetail();
  // Links que solo conocen el CUIT (p. ej. desde la hoja de un proceso): se pasa a la URL canónica.
  const canonico = cuit && ficha ? slugProveedor(ficha.empresa?.razonSocial ?? ficha.nombre, cuit) : null;
  useEffect(() => {
    if (canonico && canonico !== slug) void navigate({ to: "/proveedores/$slug", params: { slug: canonico }, replace: true });
  }, [canonico, slug, navigate]);
  if (!cuit || !ficha) {
    return (
      <div className="flex flex-col gap-4">
        <Breadcrumbs items={[{ label: "Proveedores", to: "/proveedores" }]} current={{ label: "No encontrado" }} />
        <h1 className="text-title-1-semibold tracking-tight">No encontramos a ese proveedor</h1>
        <Link to="/proveedores" className="w-fit text-text-link hover:underline">
          Ver todos los proveedores ›
        </Link>
      </div>
    );
  }
  const nombre = ficha.empresa?.razonSocial ?? ficha.nombre;
  return (
    <div className="flex flex-col gap-8">
      <Proveedor
        cuit={cuit}
        initial={ficha}
        sinTitulo
        header={
          <WithBreadcrumbs
            items={[{ label: "Proveedores", to: "/proveedores" }]}
            current={{ label: `CUIT ${cuit}`, icon: RiBuilding2Line }}
          >
            <h1 className="text-title-1-semibold tracking-tight text-balance break-words sm:text-display-4-semibold">{nombre}</h1>
          </WithBreadcrumbs>
        }
        onProceso={(ocid) => detail.open("proceso", ocid)}
      />
      <FuentesOficiales ids={FUENTES} />
    </div>
  );
}

export function OrganismosPage() {
  const organismos = organismosRoute.useLoaderData();
  const [q, setQ] = useUrlText("q");
  const [mostrar, setMostrar] = useState(PAGINA);
  const visibles = useMemo(() => {
    const n = normalizeText(q.trim());
    return n ? organismos.filter((o) => normalizeText(o.nombre).includes(n)) : organismos;
  }, [organismos, q]);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader action={<ShareButton />} icon={RiBankLine} topic="Organismos" title="¿Quién compra y cómo?">
        Los organismos del Estado provincial que más compran, cuánto gastan y qué parte lo hace por contratación directa.
      </PageHeader>
      <div className="flex flex-col gap-4">
        <ListSearch
          value={q}
          onChange={(v) => {
            setQ(v);
            setMostrar(PAGINA);
          }}
          placeholder="Buscar organismo"
          label="Buscar organismo"
        />
        <ul className={listVariants()}>
          {visibles.slice(0, mostrar).map((o) => (
            <li key={o.slug}>
              <Link to="/organismos/$slug" params={{ slug: o.slug }} className={listRowVariants()}>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-body-medium group-hover:text-text-link" title={limpiarOrganismo(o.nombre)}>
                    {limpiarOrganismo(o.nombre)}
                  </span>
                  <span className="truncate text-body-regular text-text-tertiary">
                    {formatNumber(o.procesos)} procesos · {pct(o.pctDirecta)} directa
                  </span>
                </span>
                <span className="text-body-medium whitespace-nowrap tabular-nums">{formatMoneda(o.total, "ARS")}</span>
                <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
        {mostrar < visibles.length && <VerMas onClick={() => setMostrar((n) => n + PAGINA)} />}
      </div>

      <FuentesOficiales ids={FUENTES} />
    </div>
  );
}

export function OrganismoPage() {
  const o = organismoRoute.useLoaderData();
  const { slug } = organismoRoute.useParams();
  const detail = useDetail();
  if (!o) {
    return (
      <div className="flex flex-col gap-4">
        <Breadcrumbs items={[{ label: "Organismos", to: "/organismos" }]} current={{ label: "No encontrado" }} />
        <h1 className="text-title-1-semibold tracking-tight">No encontramos a ese organismo</h1>
        <p className="text-body-regular text-text-tertiary">{slug}</p>
        <Link to="/organismos" className="w-fit text-text-link hover:underline">
          Ver todos los organismos ›
        </Link>
      </div>
    );
  }
  const nombre = limpiarOrganismo(o.nombre);
  return (
    <div className="flex flex-col gap-10">
      <EntityColumns
        aside={
          <>
            <WithBreadcrumbs items={[{ label: "Organismos", to: "/organismos" }]} current={{ label: nombre, icon: RiBankLine }}>
              <PageHeader action={<ShareButton />} title={nombre}>
                Cuánto compró, a quiénes y con qué modalidad.
              </PageHeader>
            </WithBreadcrumbs>

            <div className="grid grid-cols-2 gap-3">
              <StatTile icon={RiReceiptLine} label="Total adjudicado" value={formatMoneda(o.total, "ARS")} />
              <StatTile icon={RiFileTextLine} label="Procesos" value={formatNumber(o.procesos)} />
              <StatTile icon={RiPercentLine} label="Contratación directa" value={pct(o.pctDirecta)} note="De los procesos" />
              <StatTile icon={RiGroupLine} label="Una sola oferta" value={pct(o.pctUnaOferta)} note="De los procesos" />
            </div>
            {o.pctUnaOferta >= 20 && (
              <Alert title="Poca competencia">
                En {pct(o.pctUnaOferta)} de los procesos se presentó una sola oferta: sin competencia, el Estado no puede comparar precios.
              </Alert>
            )}
          </>
        }
      >
        {o.porAnio.length > 1 && (
          <Section id="por-anio" title={o.referenciaReal ? `Adjudicado por año, en pesos de ${o.referenciaReal}` : "Adjudicado por año"}>
            <ColumnChart
              columnas={o.porAnio.map((a) => ({
                etiqueta: String(a.anio),
                valor: a.real,
                detalle: o.referenciaReal ? `${formatMoneda(a.monto, "ARS")} nominales` : undefined,
              }))}
              formatValue={(v) => formatMoneda(v, "ARS")}
              ariaLabel={`Monto adjudicado por año por ${nombre}`}
            />
          </Section>
        )}

        <Section id="proveedores" title="Principales proveedores">
          <ul className={listVariants()}>
            {o.proveedores.map((p) => {
              const fila = (
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-body-regular group-hover:text-text-link" title={p.nombre}>
                      {p.nombre}
                    </span>
                    <span className="text-body-medium whitespace-nowrap tabular-nums">{formatMoneda(p.monto, "ARS")}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <ProportionBar value={p.monto} of={o.total} className="h-1.5 flex-1" />
                    <span className="w-20 text-right text-caption-1-regular whitespace-nowrap text-text-tertiary tabular-nums">
                      {p.procesos} {p.procesos === 1 ? "proceso" : "procesos"}
                    </span>
                  </span>
                </span>
              );
              return (
                <li key={p.cuit}>
                  {p.slug ? (
                    <Link to="/proveedores/$slug" params={{ slug: p.slug }} className={listRowVariants()}>
                      {fila}
                      <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
                    </Link>
                  ) : (
                    <div className={listRowVariants({ interactive: false })}>{fila}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>

        <Section id="recientes" title="Procesos recientes">
          <p className="-mt-2 text-body-regular text-text-tertiary">Tocá uno para ver el proceso completo.</p>
          <ul className={listVariants()}>
            {o.recientes.map((r) => (
              <li key={r.ocid}>
                <button type="button" onClick={() => detail.open("proceso", r.ocid)} className={listRowVariants()}>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-body-regular group-hover:text-text-link" title={r.titulo}>
                      {r.titulo || "Sin título"}
                    </span>
                    <span className="truncate text-caption-1-regular text-text-tertiary">
                      {r.fecha ? `${formatDate(r.fecha)} · ` : ""}
                      {r.metodo}
                    </span>
                  </span>
                  <span className="text-body-medium whitespace-nowrap tabular-nums">{r.monto ? formatMoneda(r.monto, "ARS") : "—"}</span>
                  <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      </EntityColumns>

      <FuentesOficiales ids={FUENTES} />
    </div>
  );
}
