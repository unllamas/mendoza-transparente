import { getRouteApi, Link } from "@tanstack/react-router";
import { ArrowLeft, Building2, ChevronRight, FileText, Scale } from "lucide-react";
import { useState } from "react";

import { formatMoneda } from "../celdas.ts";
import { FuentesOficiales } from "../fuente.tsx";
import { formatDate } from "../lib.ts";
import type { Senal } from "../types.ts";
import { PageHeader, Sheet } from "./components.tsx";
import { Proceso, Proveedor } from "./detalle.tsx";

const route = getRouteApi("/senales");

type Vista = { tipo: "senal" } | { tipo: "proceso"; id: string } | { tipo: "proveedor"; id: string };

export function SenalesPage() {
  const { senales } = route.useLoaderData();
  const [abierta, setAbierta] = useState<Senal | null>(null);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader icon={Scale} tema="Para mirar de cerca" titulo="Lo que los datos muestran y nadie explica">
        Patrones en los datos oficiales que merecen una explicación. No son acusaciones: son preguntas que cualquier
        ciudadano puede hacerle al Estado, con los casos concretos para revisar.
      </PageHeader>

      <ul className="grid gap-3 md:grid-cols-2">
        {senales.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setAbierta(s)}
              className="group flex h-full w-full flex-col gap-3 rounded-2xl border border-line bg-surface p-5 text-left transition-colors hover:border-link/50"
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
  const [historial, setHistorial] = useState<Vista[]>([{ tipo: "senal" }]);
  const vista = historial.at(-1)!;
  const ir = (v: Vista) => setHistorial((h) => [...h, v]);

  return (
    <Sheet titulo={s.tema} onClose={onClose}>
      {historial.length > 1 && (
        <button
          type="button"
          onClick={() => setHistorial((h) => h.slice(0, -1))}
          className="-mt-2 inline-flex w-fit items-center gap-1 rounded-md px-2 py-1 text-sm text-ink-2 hover:bg-grid hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden /> Volver
        </button>
      )}

      {vista.tipo === "proceso" && <Proceso ocid={vista.id} onProveedor={(cuit) => ir({ tipo: "proveedor", id: cuit })} />}
      {vista.tipo === "proveedor" && <Proveedor cuit={vista.id} onProceso={(ocid) => ir({ tipo: "proceso", id: ocid })} />}

      {vista.tipo === "senal" && (
        <>
          <div className="flex flex-col gap-2">
            <span className="text-4xl font-semibold tracking-tight tabular-nums">{s.cifra}</span>
            <h3 className="text-lg font-medium text-balance">{s.titulo}</h3>
            <p className="text-sm text-ink-2 text-pretty">{s.matiz}</p>
          </div>

          <div className="flex flex-col gap-1 rounded-xl bg-tile p-4 text-sm">
            <span className="font-medium">Por qué importa</span>
            <span className="text-ink-2 text-pretty">{s.porQueImporta}</span>
          </div>

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
                      onClick={() => ir({ tipo: c.tipo, id: c.id })}
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
                      <ChevronRight className="size-4 shrink-0 text-ink-muted group-hover:text-link" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {s.pedido && (
            <Link
              to="/no-publicado"
              hash={s.pedido}
              className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-on-brand hover:bg-brand-hover"
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
