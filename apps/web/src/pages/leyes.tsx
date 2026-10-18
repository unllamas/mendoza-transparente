import { PersonAvatar } from "@mt/ui/components/avatar";
import { Button, buttonClassName } from "@mt/ui/components/base/buttons/button";
import { cardVariants, listRowVariants, listVariants, tileVariants } from "@mt/ui/components/card";
import { PageHeader } from "@mt/ui/components/section";
import { cx } from "@mt/ui/lib/cx";
import {
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiExternalLinkLine,
  RiFileTextLine,
  RiGroupLine,
  RiMapPinLine,
  RiQuestionLine,
  RiScalesLine,
  RiSparklingLine,
  RiVerifiedBadgeLine,
} from "@remixicon/react";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Breadcrumbs, WithBreadcrumbs } from "@/components/breadcrumbs.tsx";
import { ListSearch } from "@/components/list-search.tsx";
import { FuentesOficiales } from "@/components/official-sources.tsx";
import { ShareButton } from "@/components/share-button.tsx";
import { formatDate, normalizeText } from "@/lib.ts";
import type { LeyDetalle } from "@/types.ts";
import { useUrlText } from "@/url-state.ts";

const listaRoute = getRouteApi("/leyes");
const detalleRoute = getRouteApi("/leyes/$numero");
const PAGINA = 40;

export function LeyesPage() {
  const leyes = listaRoute.useLoaderData();
  const [q, setQ] = useUrlText("q");
  const [mostrar, setMostrar] = useState(PAGINA);
  const visibles = useMemo(() => {
    const n = normalizeText(q.trim());
    return n ? leyes.filter((l) => normalizeText(`${l.numero} ${l.titulo} ${l.tema ?? ""}`).includes(n)) : leyes;
  }, [leyes, q]);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader action={<ShareButton />} icon={RiScalesLine} topic="Leyes" title="Las leyes que sanciona Mendoza">
        Qué dice cada ley provincial, explicado en pocas palabras, con el enlace al documento oficial.
      </PageHeader>
      <div className="flex flex-col gap-4">
        <ListSearch
          value={q}
          onChange={(v) => {
            setQ(v);
            setMostrar(PAGINA);
          }}
          placeholder="Buscar por número o palabra"
          label="Buscar ley"
        />
        <p className="text-body-regular text-text-tertiary">
          {visibles.length} {visibles.length === 1 ? "ley" : "leyes"}
        </p>
        <ul className={listVariants()}>
          {visibles.slice(0, mostrar).map((l) => (
            <li key={l.numero}>
              <Link to="/leyes/$numero" params={{ numero: l.numero }} className={cx(listRowVariants(), "sm:px-5")}>
                <span className="w-14 shrink-0 font-medium tabular-nums">{l.numero}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate group-hover:text-text-link" title={l.titulo}>
                    {l.titulo}
                  </span>
                  <span className="truncate text-body-regular whitespace-nowrap text-text-tertiary">
                    {[l.tema, l.fecha && formatDate(l.fecha)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <RiArrowRightSLine className="size-4 shrink-0 text-text-link" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
        {mostrar < visibles.length && (
          <Button variant="secondary" onClick={() => setMostrar((n) => n + PAGINA)} className="w-fit">
            Ver más
          </Button>
        )}
      </div>

      <FuentesOficiales ids={["boletin-oficial"]} />
    </div>
  );
}

export function LeyPage() {
  const ley = detalleRoute.useLoaderData();
  const { numero } = detalleRoute.useParams();
  if (!ley) {
    return (
      <div className="flex flex-col gap-4">
        <Breadcrumbs items={[{ label: "Leyes", to: "/leyes" }]} current={{ label: `Ley ${numero}` }} />
        <h1 className="text-title-1-semibold tracking-tight">No encontramos la ley {numero}</h1>
        <Link to="/leyes" className="w-fit text-text-link hover:underline">
          Ver todas las leyes ›
        </Link>
      </div>
    );
  }
  const primerArticulo = ley.bloques.find((b) => b.tipo === "articulo");
  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <WithBreadcrumbs
        items={[{ label: "Leyes", to: "/leyes" }]}
        current={{ label: `Ley ${ley.numero}${ley.tema ? ` · ${ley.tema}` : ""}`, icon: RiScalesLine }}
      >
        <header className="flex flex-col gap-3">
          <h1 className="text-title-1-semibold tracking-tight text-balance sm:text-display-4-regular">{ley.titulo}</h1>
          <div className="flex flex-col gap-0.5 text-body-regular text-text-tertiary sm:flex-row sm:gap-4">
            {ley.fecha && <span className="whitespace-nowrap">Sancionada el {formatDate(ley.fecha)}</span>}
            {ley.publicada && (
              <span className="whitespace-nowrap">
                Publicada el {formatDate(ley.publicada)}
                {ley.boletin && ` · Boletín N.º ${ley.boletin}`}
              </span>
            )}
          </div>
          {ley.signers.length > 0 && <Firmantes law={ley.numero} signers={ley.signers} />}
        </header>
      </WithBreadcrumbs>

      <section aria-labelledby="pocas-palabras" className={cx(tileVariants({ size: "lg" }), "flex flex-col gap-4 sm:p-6")}>
        <h2 id="pocas-palabras" className="text-body-medium text-text-tertiary">
          En pocas palabras
        </h2>
        {ley.resumen ? (
          <>
            <p className="text-title-3-regular leading-relaxed text-pretty text-text-primary">{ley.resumen.texto}</p>
            {ley.resumen.aQuien && (
              <p className="flex items-start gap-2.5 text-text-secondary">
                <RiGroupLine className="mt-0.5 size-4 shrink-0 text-text-tertiary" aria-hidden />
                <span className="text-pretty">
                  <span className="text-text-tertiary">A quién le toca: </span>
                  {ley.resumen.aQuien}
                </span>
              </p>
            )}
            {ley.places.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="Departamentos">
                {ley.places.map((m) => (
                  <li key={m.slug}>
                    <Link
                      to="/municipios/$slug"
                      params={{ slug: m.slug }}
                      data-track="law.place.open"
                      data-track-law={ley.numero}
                      className={buttonClassName({ variant: "secondary", className: "text-text-link" })}
                    >
                      <RiMapPinLine className="size-5" aria-hidden />
                      {m.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {ley.resumen.puntos.length > 0 && (
              <div className="flex flex-col gap-2.5">
                <h3 className="text-body-medium text-text-tertiary">Qué cambia</h3>
                <ul className="flex flex-col gap-2.5">
                  {ley.resumen.puntos.map((p) => (
                    <li key={p} className="flex gap-3 text-text-secondary">
                      <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-highlight" aria-hidden />
                      <span className="text-pretty">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {ley.resumen.noDice.length > 0 && (
              <div className="flex flex-col gap-2.5">
                <h3 className="text-body-medium text-text-tertiary">Lo que el texto publicado no dice</h3>
                <ul className="flex flex-col gap-2.5">
                  {ley.resumen.noDice.map((p) => (
                    <li key={p} className="flex gap-3 text-text-tertiary">
                      <RiQuestionLine className="mt-1 size-4 shrink-0" aria-hidden />
                      <span className="text-pretty">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="flex items-start gap-2 text-caption-1-regular text-text-tertiary">
              {ley.resumen.revisado ? (
                <RiVerifiedBadgeLine className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              ) : (
                <RiSparklingLine className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              )}
              {ley.resumen.revisado
                ? `Resumen revisado a mano el ${formatDate(ley.resumen.revisado)}. Ante cualquier duda, vale el texto oficial.`
                : "Resumen hecho con IA a partir del texto oficial. Ante cualquier duda, vale el texto oficial."}
            </p>
          </>
        ) : (
          <>
            {primerArticulo?.tipo === "articulo" && (
              <p className="leading-relaxed text-pretty text-text-primary">{primerArticulo.parrafos[0]}</p>
            )}
            <p className="text-caption-1-regular text-text-tertiary">
              Todavía no tiene un resumen en lenguaje simple: arriba, su primer artículo.
            </p>
          </>
        )}
      </section>

      {ley.urlPdf && (
        <a
          href={ley.urlPdf}
          target="_blank"
          rel="noreferrer"
          id="ley-texto-oficial"
          data-track="law.official_pdf.open"
          data-track-law={ley.numero}
          className={buttonClassName({ variant: "primary", className: "w-fit" })}
        >
          <RiFileTextLine className="size-5" aria-hidden /> Leer el texto oficial (PDF){" "}
          <RiExternalLinkLine className="size-5" aria-hidden />
        </a>
      )}

      {ley.bloques.length > 0 && <TextoCompleto ley={ley} />}

      <FuentesOficiales ids={["boletin-oficial"]} />
    </div>
  );
}

/**
 * Quienes firman la ley. Con ficha propia van como botón; sin ficha, con la
 * misma altura y la misma cara pero sobre el fondo, para que la fila no salte.
 */
function Firmantes({ law, signers }: { law: LeyDetalle["numero"]; signers: LeyDetalle["signers"] }) {
  return (
    <div className="flex flex-col gap-2 pt-1">
      <span className="text-body-regular text-text-tertiary">Firman</span>
      <ul className="flex flex-wrap gap-2">
        {signers.map((f) => {
          const chip = (
            <>
              <PersonAvatar name={f.name} photo={f.photo} className="size-7 text-[10px]" />
              <span className="whitespace-nowrap">{f.name}</span>
            </>
          );
          return (
            <li key={f.name}>
              {f.path ? (
                <Link
                  to={f.path}
                  data-track="law.signer.open"
                  data-track-law={law}
                  className={buttonClassName({ variant: "secondary", className: "gap-2 pl-1.5" })}
                >
                  {chip}
                </Link>
              ) : (
                <span className="flex h-11 items-center gap-2 rounded-2lg pr-3 pl-1.5 text-body-medium text-text-secondary">{chip}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Texto de la ley con su estructura, plegado: el que quiera leerlo entero lo abre. */
function TextoCompleto({ ley }: { ley: LeyDetalle }) {
  const articulos = ley.bloques.filter((b) => b.tipo === "articulo").length;
  return (
    <details className={cx(cardVariants(), "group overflow-hidden p-0")}>
      <summary
        id="ley-texto-completo"
        data-track="law.full_text.toggle"
        data-track-law={ley.numero}
        className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 hover:bg-background-secondary-default [&::-webkit-details-marker]:hidden"
      >
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">Texto completo</span>
          <span className="truncate text-body-regular whitespace-nowrap text-text-tertiary">
            {articulos} {articulos === 1 ? "artículo" : "artículos"}
          </span>
        </span>
        <RiArrowDownSLine className="size-4 shrink-0 text-text-tertiary transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="flex flex-col gap-5 border-t border-separator-border px-5 py-5 text-[15px] leading-relaxed break-words">
        {ley.encabezado && <p className="font-semibold text-text-primary">{ley.encabezado}</p>}
        {ley.bloques.map((b, i) =>
          b.tipo === "seccion" ? (
            <h3 key={i} className="pt-2 text-body-semibold text-text-primary">
              {b.texto}
            </h3>
          ) : b.tipo === "articulo" ? (
            <div key={i} className="flex flex-col gap-1.5">
              <span className="text-body-medium text-text-tertiary">
                Artículo {b.numero}
                {b.titulo && <span className="text-text-primary"> · {b.titulo}</span>}
              </span>
              {b.parrafos.map((p, j) => (
                <p key={j} className="text-text-secondary">
                  {p}
                </p>
              ))}
            </div>
          ) : (
            <p key={i} className="text-text-secondary">
              {b.texto}
            </p>
          ),
        )}
        {ley.cierre && (
          <div className="flex flex-col gap-1 border-t border-separator-border pt-4 text-body-regular text-text-tertiary">
            <p>{ley.cierre.dada}</p>
          </div>
        )}
      </div>
    </details>
  );
}
