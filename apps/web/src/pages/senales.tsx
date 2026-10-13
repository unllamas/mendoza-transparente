import { Alert } from "@mt/ui/components/alert";
import { buttonClassName } from "@mt/ui/components/base/buttons/button";
import { cardVariants, listRowVariants, listVariants } from "@mt/ui/components/card";
import { PageHeader } from "@mt/ui/components/section";
import { cx } from "@mt/ui/lib/cx";
import { RiArrowRightSLine, RiBuilding2Line, RiFileTextLine, RiScalesLine } from "@remixicon/react";
import { getRouteApi, Link, useRouter, useRouterState } from "@tanstack/react-router";

import { formatMoneda } from "@/celdas.ts";
import { useDetail } from "@/components/detail-sheet.tsx";
import { FuentesOficiales } from "@/components/official-sources.tsx";
import { TrackedSheet } from "@/components/tracked-sheet.tsx";
import { formatDate } from "@/lib.ts";
import type { Senal } from "@/types.ts";

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
  const setAbierta = (x: Senal | null) => router.navigate({ href: withSignal(x?.id ?? null), replace: !x, resetScroll: false });

  return (
    <div className="flex flex-col gap-10">
      <PageHeader icon={RiScalesLine} topic="Para mirar de cerca" title="Lo que los datos muestran y nadie explica">
        Patrones en los datos oficiales que merecen una explicación. No son acusaciones: son preguntas que cualquier ciudadano puede hacerle
        al Estado, con los casos concretos para revisar.
      </PageHeader>

      <ul className="grid gap-3 md:grid-cols-2">
        {senales.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setAbierta(s)}
              className={cx(cardVariants({ size: "lg" }), "flex h-full w-full flex-col gap-3")}
            >
              <span className="text-caption-1-medium tracking-wide text-text-tertiary uppercase">{s.tema}</span>
              <span className="text-display-3-semibold tracking-tight whitespace-nowrap tabular-nums">{s.cifra}</span>
              <span className="text-body-regular text-pretty">{s.titulo}</span>
              <span className="text-body-regular text-text-tertiary text-pretty">{s.matiz}</span>
              <span className="mt-auto inline-flex items-center gap-1 pt-1 text-body-medium text-text-link">
                {s.casos.length ? `Ver los ${s.casos.length} casos` : "Ver más"} <RiArrowRightSLine className="size-5" aria-hidden />
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
    <TrackedSheet title={s.tema} onClose={onClose}>
      {
        <>
          <div className="flex flex-col gap-2">
            <span className="text-display-3-semibold tracking-tight tabular-nums">{s.cifra}</span>
            <h3 className="text-title-3-medium text-balance">{s.titulo}</h3>
            <p className="text-body-regular text-text-secondary text-pretty">{s.matiz}</p>
          </div>

          <Alert title="Por qué importa">{s.porQueImporta}</Alert>

          {s.casos.length > 0 && (
            <section className="flex flex-col gap-2">
              <div className="flex flex-col gap-0.5">
                <h4 className="text-body-semibold">{s.casosTitulo}</h4>
                <span className="text-caption-1-regular text-text-tertiary">Tocá un caso para ver el detalle completo</span>
              </div>
              <ul className={listVariants()}>
                {s.casos.map((c) => (
                  <li key={`${c.tipo}-${c.id}-${c.titulo}`}>
                    <button type="button" onClick={() => detail.open(c.tipo, c.id)} className={listRowVariants()}>
                      {c.tipo === "proveedor" ? (
                        <RiBuilding2Line className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
                      ) : (
                        <RiFileTextLine className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
                      )}
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="line-clamp-2 text-body-regular group-hover:text-text-link">{c.titulo}</span>
                        <span className="line-clamp-2 text-caption-1-regular text-text-tertiary">
                          {c.fecha ? `${formatDate(c.fecha)} · ` : ""}
                          {c.detalle}
                        </span>
                      </span>
                      {c.monto !== null && (
                        <span className="text-body-medium whitespace-nowrap tabular-nums">{formatMoneda(c.monto, "ARS")}</span>
                      )}
                      <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
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
              className={buttonClassName({ variant: "primary", className: "w-fit" })}
            >
              Pedir los datos actualizados <RiArrowRightSLine className="size-5" aria-hidden />
            </Link>
          )}

          <p className="border-t border-separator-border pt-4 text-caption-1-regular text-text-tertiary text-pretty">
            Cómo lo calculamos: {s.metodo}
          </p>
        </>
      }
    </TrackedSheet>
  );
}
