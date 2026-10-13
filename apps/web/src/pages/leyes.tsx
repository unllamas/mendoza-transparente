import { PersonAvatar } from "@mt/ui/components/avatar";
import { buttonVariants } from "@mt/ui/components/button";
import { tileVariants } from "@mt/ui/components/card";
import { PageHeader } from "@mt/ui/components/section";
import { cn } from "@mt/ui/lib/utils";
import { getRouteApi, Link } from "@tanstack/react-router";
import { BadgeCheck, ChevronDown, ChevronRight, CircleHelp, ExternalLink, FileText, MapPin, Scale, Sparkles, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs.tsx";
import { ListSearch } from "@/components/list-search.tsx";
import { FuentesOficiales } from "@/components/official-sources.tsx";
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
      <PageHeader icon={Scale} topic="Leyes" title="Las leyes que sanciona Mendoza">
        Qué dice cada ley provincial, explicado en pocas palabras, con el enlace al documento oficial.
      </PageHeader>
      <FuentesOficiales ids={["boletin-oficial"]} />
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
        <p className="text-sm text-ink-muted">
          {visibles.length} {visibles.length === 1 ? "ley" : "leyes"}
        </p>
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl bg-tile">
          {visibles.slice(0, mostrar).map((l) => (
            <li key={l.numero}>
              <Link
                to="/leyes/$numero"
                params={{ numero: l.numero }}
                className="group flex items-center gap-4 px-4 py-3 hover:bg-grid/50 sm:px-5"
              >
                <span className="w-14 shrink-0 font-medium tabular-nums">{l.numero}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate group-hover:text-link" title={l.titulo}>
                    {l.titulo}
                  </span>
                  <span className="truncate text-sm whitespace-nowrap text-ink-muted">
                    {[l.tema, l.fecha && formatDate(l.fecha)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-link" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
        {mostrar < visibles.length && (
          <button
            type="button"
            onClick={() => setMostrar((n) => n + PAGINA)}
            className={cn(buttonVariants({ variant: "secondary" }), "w-fit")}
          >
            Ver más
          </button>
        )}
      </div>
    </div>
  );
}

export function LeyPage() {
  const ley = detalleRoute.useLoaderData();
  const { numero } = detalleRoute.useParams();
  if (!ley) {
    return (
      <div className="flex flex-col gap-4">
        <Breadcrumbs items={[{ label: "Leyes", to: "/leyes" }, { label: `Ley ${numero}` }]} />
        <h1 className="text-2xl font-semibold tracking-tight">No encontramos la ley {numero}</h1>
        <Link to="/leyes" className="w-fit text-link hover:underline">
          Ver todas las leyes ›
        </Link>
      </div>
    );
  }
  const primerArticulo = ley.bloques.find((b) => b.tipo === "articulo");
  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <Breadcrumbs items={[{ label: "Leyes", to: "/leyes" }, { label: `Ley ${ley.numero}` }]} />

      <header className="flex flex-col gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm whitespace-nowrap text-ink-muted">
          <Scale className="size-4 shrink-0" aria-hidden />
          <span className="truncate">
            Ley {ley.numero}
            {ley.tema && ` · ${ley.tema}`}
          </span>
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{ley.titulo}</h1>
        <div className="flex flex-col gap-0.5 text-sm text-ink-muted sm:flex-row sm:gap-4">
          {ley.fecha && <span className="whitespace-nowrap">Sancionada el {formatDate(ley.fecha)}</span>}
          {ley.publicada && (
            <span className="whitespace-nowrap">
              Publicada el {formatDate(ley.publicada)}
              {ley.boletin && ` · Boletín N.º ${ley.boletin}`}
            </span>
          )}
        </div>
      </header>

      <section aria-labelledby="pocas-palabras" className={cn(tileVariants({ size: "lg" }), "flex flex-col gap-4 sm:p-6")}>
        <h2 id="pocas-palabras" className="text-sm font-medium text-ink-muted">
          En pocas palabras
        </h2>
        {ley.resumen ? (
          <>
            <p className="text-lg leading-relaxed text-pretty text-ink">{ley.resumen.texto}</p>
            {ley.resumen.aQuien && (
              <p className="flex items-start gap-2.5 text-ink-2">
                <Users className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
                <span className="text-pretty">
                  <span className="text-ink-muted">A quién le toca: </span>
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
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line px-4 text-link hover:border-link"
                    >
                      <MapPin className="size-4" aria-hidden />
                      {m.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {ley.resumen.puntos.length > 0 && (
              <div className="flex flex-col gap-2.5">
                <h3 className="text-sm font-medium text-ink-muted">Qué cambia</h3>
                <ul className="flex flex-col gap-2.5">
                  {ley.resumen.puntos.map((p) => (
                    <li key={p} className="flex gap-3 text-ink-2">
                      <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                      <span className="text-pretty">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {ley.resumen.noDice.length > 0 && (
              <div className="flex flex-col gap-2.5">
                <h3 className="text-sm font-medium text-ink-muted">Lo que el texto publicado no dice</h3>
                <ul className="flex flex-col gap-2.5">
                  {ley.resumen.noDice.map((p) => (
                    <li key={p} className="flex gap-3 text-ink-muted">
                      <CircleHelp className="mt-1 size-4 shrink-0" aria-hidden />
                      <span className="text-pretty">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="flex items-start gap-2 text-xs text-ink-muted">
              {ley.resumen.revisado ? (
                <BadgeCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              ) : (
                <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              )}
              {ley.resumen.revisado
                ? `Resumen revisado a mano el ${formatDate(ley.resumen.revisado)}. Ante cualquier duda, vale el texto oficial.`
                : "Resumen hecho con IA a partir del texto oficial. Ante cualquier duda, vale el texto oficial."}
            </p>
          </>
        ) : (
          <>
            {primerArticulo?.tipo === "articulo" && <p className="leading-relaxed text-pretty text-ink">{primerArticulo.parrafos[0]}</p>}
            <p className="text-xs text-ink-muted">Todavía no tiene un resumen en lenguaje simple: arriba, su primer artículo.</p>
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
          className={cn(buttonVariants({ variant: "primary" }), "w-fit")}
        >
          <FileText className="size-4" aria-hidden /> Leer el texto oficial (PDF) <ExternalLink className="size-3.5" aria-hidden />
        </a>
      )}

      {ley.bloques.length > 0 && <TextoCompleto ley={ley} />}

      <FuentesOficiales ids={["boletin-oficial"]} />
    </div>
  );
}

/** Texto de la ley con su estructura, plegado: el que quiera leerlo entero lo abre. */
function TextoCompleto({ ley }: { ley: LeyDetalle }) {
  const articulos = ley.bloques.filter((b) => b.tipo === "articulo").length;
  return (
    <details className="group overflow-hidden rounded-2xl border border-line">
      <summary
        id="ley-texto-completo"
        data-track="law.full_text.toggle"
        data-track-law={ley.numero}
        className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 hover:bg-grid/50 [&::-webkit-details-marker]:hidden"
      >
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">Texto completo</span>
          <span className="truncate text-sm whitespace-nowrap text-ink-muted">
            {articulos} {articulos === 1 ? "artículo" : "artículos"}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="flex flex-col gap-5 border-t border-line px-5 py-5 text-[15px] leading-relaxed break-words">
        {ley.encabezado && <p className="font-semibold text-ink">{ley.encabezado}</p>}
        {ley.bloques.map((b, i) =>
          b.tipo === "seccion" ? (
            <h3 key={i} className="pt-2 text-sm font-semibold text-ink">
              {b.texto}
            </h3>
          ) : b.tipo === "articulo" ? (
            <div key={i} className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-muted">
                Artículo {b.numero}
                {b.titulo && <span className="text-ink"> · {b.titulo}</span>}
              </span>
              {b.parrafos.map((p, j) => (
                <p key={j} className="text-ink-2">
                  {p}
                </p>
              ))}
            </div>
          ) : (
            <p key={i} className="text-ink-2">
              {b.texto}
            </p>
          ),
        )}
        {ley.cierre && (
          <div className="flex flex-col gap-1 border-t border-line pt-4 text-sm text-ink-muted">
            <p>{ley.cierre.dada}</p>
            {ley.signers.length > 0 && (
              <div className="flex flex-col gap-2 pt-1">
                <span>Firman:</span>
                <ul className="flex flex-wrap gap-2">
                  {ley.signers.map((f) => {
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
                            className="inline-flex items-center gap-2 rounded-full border border-line py-1 pr-3 pl-1 text-ink hover:border-link hover:text-link"
                          >
                            {chip}
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-2 rounded-full bg-grid/60 py-1 pr-3 pl-1 text-ink-2">{chip}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
