import { getRouteApi, Link } from "@tanstack/react-router";
import { ChevronRight, ExternalLink, Scale } from "lucide-react";
import { useMemo, useState } from "react";

import { FuentesOficiales } from "../fuente.tsx";
import { formatDate } from "../lib.ts";
import { Buscador, Migas, normalizar, PageHeader } from "./components.tsx";

const listaRoute = getRouteApi("/leyes");
const detalleRoute = getRouteApi("/leyes/$numero");
const PAGINA = 40;

export function LeyesPage() {
  const leyes = listaRoute.useLoaderData();
  const [q, setQ] = useState("");
  const [mostrar, setMostrar] = useState(PAGINA);
  const visibles = useMemo(() => {
    const n = normalizar(q.trim());
    return n ? leyes.filter((l) => normalizar(`${l.numero} ${l.titulo}`).includes(n)) : leyes;
  }, [leyes, q]);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader icon={Scale} tema="Leyes" titulo="Las leyes que sanciona Mendoza">
        Las leyes publicadas en el Boletín Oficial, con su texto completo y el enlace al documento oficial.
      </PageHeader>
      <FuentesOficiales ids={["boletin-oficial"]} />
      <div className="flex flex-col gap-4">
        <Buscador value={q} onChange={(v) => { setQ(v); setMostrar(PAGINA); }} placeholder="Buscar por número o palabra" label="Buscar ley" />
        <p className="text-sm text-ink-muted">{visibles.length} {visibles.length === 1 ? "ley" : "leyes"}</p>
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl bg-tile">
          {visibles.slice(0, mostrar).map((l) => (
            <li key={l.numero}>
              <Link to="/leyes/$numero" params={{ numero: l.numero }} className="group flex items-center gap-4 px-4 py-3 hover:bg-grid/50 sm:px-5">
                <span className="w-14 shrink-0 font-medium tabular-nums">{l.numero}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate group-hover:text-link" title={l.titulo}>{l.titulo}</span>
                  {l.fecha && <span className="truncate text-sm whitespace-nowrap text-ink-muted">{formatDate(l.fecha)}</span>}
                </span>
                <ChevronRight className="size-4 shrink-0 text-ink-muted group-hover:text-link" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
        {mostrar < visibles.length && (
          <button type="button" onClick={() => setMostrar((n) => n + PAGINA)} className="w-fit rounded-lg bg-brand px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-hover">
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
        <Migas items={[{ label: "Leyes", to: "/leyes" }, { label: `Ley ${numero}` }]} />
        <h1 className="text-2xl font-semibold tracking-tight">No encontramos la ley {numero}</h1>
        <Link to="/leyes" className="w-fit text-link hover:underline">
          Ver todas las leyes ›
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      <Migas items={[{ label: "Leyes", to: "/leyes" }, { label: `Ley ${ley.numero}` }]} />
      <div className="flex max-w-2xl flex-col gap-3">
        <span className="flex items-center gap-2 text-sm text-ink-muted">
          <Scale className="size-4" aria-hidden /> Ley provincial
        </span>
        <h1 className="text-3xl font-semibold tracking-tight whitespace-nowrap sm:text-4xl">Ley {ley.numero}</h1>
        <dl className="flex flex-col gap-1 text-sm text-ink-2">
          {ley.fecha && (
            <div className="flex gap-2 whitespace-nowrap">
              <dt className="text-ink-muted">Fecha:</dt>
              <dd>{formatDate(ley.fecha)}</dd>
            </div>
          )}
          {ley.boletin && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-ink-muted">Publicada en el Boletín N.º</dt>
              <dd>
                {ley.boletin}
                {ley.publicada && ` (${formatDate(ley.publicada)})`}
              </dd>
            </div>
          )}
        </dl>
        {ley.urlPdf && (
          <a href={ley.urlPdf} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1.5 text-link hover:underline">
            PDF oficial del Boletín <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
      </div>
      <FuentesOficiales ids={["boletin-oficial"]} />
      <article className="max-w-[68ch] text-base leading-relaxed break-words whitespace-pre-line text-ink">{ley.texto}</article>
    </div>
  );
}
