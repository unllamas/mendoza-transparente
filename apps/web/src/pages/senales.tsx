import { cn } from "@mt/ui/lib/utils";
import { buttonVariants } from "@mt/ui/components/button";
import { Alert } from "@mt/ui/components/alert";
import { PageHeader } from "@mt/ui/components/section";
import { getRouteApi, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { Building2, ChevronRight, FileText, Scale } from "lucide-react";

import { formatMoneda } from "../celdas.ts";
import { FuentesOficiales } from "../fuente.tsx";
import { formatDate } from "../lib.ts";
import type { Senal } from "../types.ts";
import { Sheet } from "./components.tsx";
import { useDetail } from "../detail-sheet.tsx";

const route = getRouteApi("/senales");


export function SenalesPage() {
  const { senales } = route.useLoaderData();
  const router = useRouter();
  // The open signal lives in the URL (?senal=<id>): shareable, and the back button closes it.
  const search = useRouterState({ select: (st) => st.location.search as Record<string, unknown> });
  const abierta = senales.find((x) => x.id === search.senal) ?? null;
  const withSignal = (id: string | null) => {
    const url = new URL(window.location.href);
    url.searchParams.delete("proceso");
    url.searchParams.delete("proveedor");
    if (id) url.searchParams.set("senal", id);
    else url.searchParams.delete("senal");
    return `${url.pathname}${url.search}`;
  };
  // resetScroll: false keeps the list where it was: opening a card at the bottom must not jump to the top.
  const setAbierta = (x: Senal | null) =>
    router.navigate({ href: withSignal(x?.id ?? null), replace: !x, resetScroll: false });

  return (
    <div className="flex flex-col gap-10">
      <PageHeader icon={Scale} topic="Para mirar de cerca" title="Lo que los datos muestran y nadie explica">
        Patrones en los datos oficiales que merecen una explicación. No son acusaciones: son preguntas que cualquier
        ciudadano puede hacerle al Estado, con los casos concretos para revisar.
      </PageHeader>

      <ul className="grid gap-3 md:grid-cols-2">
        {senales.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setAbierta(s)}
              className="group flex h-full w-full flex-col gap-3 rounded-2xl border border-line bg-surface p-5 text-left transition-colors hover:border-link"
            >
              <span className="text-xs font-medium tracking-wide text-ink-muted uppercase">{s.tema}</span>
              <span className="text-4xl font-semibold tracking-tight whitespace-nowrap tabular-nums">{s.cifra}</span>
              <span className="text-pretty">{s.titulo}</span>
              <span className="text-sm text-ink-muted text-pretty">{s.matiz}</span>
              <span className="mt-auto inline-flex items-center gap-1 pt-1 text-sm font-medium text-link">
                {s.casos.length ? `Ver los ${s.casos.length} casos` : "Ver más"} <ChevronRight className="size-4" aria-hidden />
              </span>
            </button>
          </li>
        ))}
      </ul>

      <FuentesOficiales ids={["compras-ocds", "proveedores"]} />

      {abierta && <SenalSheet senal={abierta} onClose={() => setAbierta(null)} />}
    </div>
  );
}

function SenalSheet({ senal: s, onClose }: { senal: Senal; onClose: () => void }) {
  // Cases open the URL-driven process/supplier sheet on top (?proceso= / ?proveedor=).
  const detail = useDetail();

  return (
    <Sheet titulo={s.tema} onClose={onClose}>
      {(
        <>
          <div className="flex flex-col gap-2">
            <span className="text-4xl font-semibold tracking-tight tabular-nums">{s.cifra}</span>
            <h3 className="text-lg font-medium text-balance">{s.titulo}</h3>
            <p className="text-sm text-ink-2 text-pretty">{s.matiz}</p>
          </div>

          <Alert title="Por qué importa">{s.porQueImporta}</Alert>

          {s.casos.length > 0 && (
            <section className="flex flex-col gap-2">
              <div className="flex flex-col gap-0.5">
                <h4 className="text-sm font-semibold">{s.casosTitulo}</h4>
                <span className="text-xs text-ink-muted">Tocá un caso para ver el detalle completo</span>
              </div>
              <ul className="flex flex-col divide-y divide-line">
                {s.casos.map((c) => (
                  <li key={`${c.tipo}-${c.id}-${c.titulo}`}>
                    <button
                      type="button"
                      onClick={() => detail.open(c.tipo, c.id)}
                      className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-tile"
                    >
                      {c.tipo === "proveedor" ? (
                        <Building2 className="size-4 shrink-0 text-ink-muted" aria-hidden />
                      ) : (
                        <FileText className="size-4 shrink-0 text-ink-muted" aria-hidden />
                      )}
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="line-clamp-2 text-sm group-hover:text-link">{c.titulo}</span>
                        <span className="line-clamp-2 text-xs text-ink-muted">
                          {c.fecha ? `${formatDate(c.fecha)} · ` : ""}
                          {c.detalle}
                        </span>
                      </span>
                      {c.monto !== null && (
                        <span className="text-sm font-medium whitespace-nowrap tabular-nums">{formatMoneda(c.monto, "ARS")}</span>
                      )}
                      <ChevronRight className="size-4 shrink-0 text-link" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {s.pedido && (
            <Link
              to="/no-publicado"
              search={{ dato: s.pedido } as never}
              className={cn(buttonVariants({ variant: "primary" }), "w-fit")}
            >
              Pedir los datos actualizados <ChevronRight className="size-4" aria-hidden />
            </Link>
          )}

          <p className="border-t border-line pt-4 text-xs text-ink-muted text-pretty">Cómo lo calculamos: {s.metodo}</p>
        </>
      )}
    </Sheet>
  );
}
