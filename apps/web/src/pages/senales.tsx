import { Alert } from "@mt/ui/components/alert";
import { buttonClassName } from "@mt/ui/components/base/buttons/button";
import { Dropdown, DropdownItem, DropdownPopover, DropdownTrigger } from "@mt/ui/components/base/dropdown/dropdown";
import { cardVariants, listRowVariants, listVariants } from "@mt/ui/components/card";
import { PageHeader, Section } from "@mt/ui/components/section";
import { cx } from "@mt/ui/lib/cx";
import { RiArrowRightSLine, RiArrowUpDownLine, RiBuilding2Line, RiCheckLine, RiFileTextLine, RiScalesLine } from "@remixicon/react";
import { getRouteApi, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useState } from "react";

import { track } from "@/analytics.ts";

import { formatMoneda } from "@/celdas.ts";
import { useDetail } from "@/components/detail-sheet.tsx";
import { FuentesOficiales } from "@/components/official-sources.tsx";
import { ShareButton } from "@/components/share-button.tsx";
import { TrackedSheet } from "@/components/tracked-sheet.tsx";
import { formatDate } from "@/lib.ts";
import type { Caso, Senal, SignalGroup } from "@/types.ts";
import { useUrlOption } from "@/url-state.ts";

const route = getRouteApi("/senales");

export function SenalesPage() {
  const { senales } = route.useLoaderData();
  // Missing data goes first and alone: it limits every other signal on the page.
  const lead = senales.find((s) => s.group === "datos");
  const router = useRouter();
  // The open signal lives in the URL (?senal=<id>): shareable, and the back button closes it.
  const search = useRouterState({ select: (st) => st.location.search as Record<string, unknown> });
  const abierta = senales.find((x) => x.id === search.senal) ?? null;
  const withSignal = (id: string | null) => {
    const url = new URL(window.location.href);
    url.searchParams.delete("proceso");
    url.searchParams.delete("proveedor");
    url.searchParams.delete("orden");
    if (id) url.searchParams.set("senal", id);
    else url.searchParams.delete("senal");
    return `${url.pathname}${url.search}`;
  };
  // resetScroll: false keeps the list where it was: opening a card at the bottom must not jump to the top.
  const setAbierta = (x: Senal | null) => router.navigate({ href: withSignal(x?.id ?? null), replace: !x, resetScroll: false });

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        action={<ShareButton />}
        icon={RiScalesLine}
        topic="Para mirar de cerca"
        title="Lo que los datos muestran y nadie explica"
      >
        Patrones en los datos oficiales que merecen una explicación. No son acusaciones: son preguntas que cualquier ciudadano puede hacerle
        al Estado, con los casos concretos para revisar.
      </PageHeader>

      {lead && (
        <Alert title={`${lead.cifra} ${lead.titulo}`}>
          <div className="flex flex-col gap-3">
            <p>{lead.matiz}</p>
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              {lead.pedido && (
                <Link
                  to="/no-publicado"
                  search={{ dato: lead.pedido } as never}
                  className="inline-flex min-h-11 items-center gap-1 text-body-medium text-text-link"
                >
                  Pedir los datos actualizados <RiArrowRightSLine className="size-5" aria-hidden />
                </Link>
              )}
              <button
                type="button"
                onClick={() => setAbierta(lead)}
                className="inline-flex min-h-11 items-center gap-1 text-body-medium text-text-link"
              >
                Por qué importa <RiArrowRightSLine className="size-5" aria-hidden />
              </button>
            </div>
          </div>
        </Alert>
      )}

      {GROUPS.map((g) => {
        const items = senales.filter((s) => s.group === g);
        if (!items.length) return null;
        return (
          <Section key={g} id={g} title={items[0]!.tema}>
            <ul className="grid gap-3 md:grid-cols-2">
              {items.map((s) => (
                <li key={s.id} className="md:last:odd:col-span-2">
                  <SignalCard signal={s} onOpen={setAbierta} />
                </li>
              ))}
            </ul>
          </Section>
        );
      })}

      <FuentesOficiales ids={["compras-ocds", "proveedores"]} />

      {abierta && <SenalSheet senal={abierta} onClose={() => setAbierta(null)} />}
    </div>
  );
}

/** Blocks of the page, in reading order; "datos" goes above them, without a title. */
const GROUPS: SignalGroup[] = ["competencia", "precios", "proveedores"];

function SignalCard({ signal: s, onOpen }: { signal: Senal; onOpen: (s: Senal) => void }) {
  return (
    <button type="button" onClick={() => onOpen(s)} className={cx(cardVariants({ size: "lg" }), "flex h-full w-full flex-col gap-3")}>
      <span className="text-display-3-semibold tracking-tight whitespace-nowrap tabular-nums">{s.cifra}</span>
      <span className="text-body-regular text-pretty">{s.titulo}</span>
      <span className="text-body-regular text-text-tertiary text-pretty">{s.matiz}</span>
      <span className="mt-auto inline-flex items-center gap-1 pt-1 text-body-medium text-text-link">
        {s.casos.length ? `Ver los ${s.casos.length} casos` : "Por qué importa"} <RiArrowRightSLine className="size-5" aria-hidden />
      </span>
    </button>
  );
}

type CaseOrder = "relevantes" | "mayor" | "menor" | "reciente" | "antiguo";
const CASE_ORDERS: readonly CaseOrder[] = ["relevantes", "mayor", "menor", "reciente", "antiguo"];
const CASE_ORDER_LABELS: Record<CaseOrder, string> = {
  relevantes: "Relevantes",
  mayor: "Mayor monto",
  menor: "Menor monto",
  reciente: "Más reciente",
  antiguo: "Más antiguo",
};

/** Sorts the cases; those without the amount or date being sorted by go last. "relevantes" keeps the signal's own order. */
function sortCases(cases: Caso[], order: CaseOrder): Caso[] {
  if (order === "relevantes") return cases;
  const byAmount = order === "mayor" || order === "menor";
  const key = (c: Caso) => (byAmount ? c.monto : c.fecha ? Date.parse(c.fecha) : null);
  const sign = order === "mayor" || order === "reciente" ? -1 : 1;
  return [...cases].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === null || Number.isNaN(ka)) return kb === null || Number.isNaN(kb) ? 0 : 1;
    if (kb === null || Number.isNaN(kb)) return -1;
    return sign * (ka - kb);
  });
}

/** "Ordenar" button next to the list title: a menu instead of an extra row of options. */
function CaseOrderMenu({ orders, value, onChange }: { orders: CaseOrder[]; value: CaseOrder; onChange: (o: CaseOrder) => void }) {
  const [open, setOpen] = useState(false);
  const select = (o: CaseOrder) => {
    if (o !== value) track("signal.cases_sort.change", { value: o });
    onChange(o);
    setOpen(false);
  };
  return (
    <Dropdown isOpen={open} onOpenChange={setOpen}>
      <DropdownTrigger
        aria-label={`Ordenar los casos: ${CASE_ORDER_LABELS[value]}`}
        className={buttonClassName({ variant: "secondary", className: "shrink-0" })}
      >
        <RiArrowUpDownLine className="size-5" aria-hidden />
        <span className="whitespace-nowrap">{value === "relevantes" ? "Ordenar" : CASE_ORDER_LABELS[value]}</span>
      </DropdownTrigger>
      <DropdownPopover aria-label="Ordenar los casos" placement="bottom end">
        {orders.map((o) => (
          <DropdownItem key={o} selected={o === value} onSelect={() => select(o)} className="min-h-11 justify-between text-body-medium">
            {CASE_ORDER_LABELS[o]}
            {o === value && <RiCheckLine className="size-5 text-text-link" aria-hidden />}
          </DropdownItem>
        ))}
      </DropdownPopover>
    </Dropdown>
  );
}

function SenalSheet({ senal: s, onClose }: { senal: Senal; onClose: () => void }) {
  // Cases open the URL-driven process/supplier sheet on top (?proceso= / ?proveedor=).
  const detail = useDetail();
  // Only the orders that make sense for this signal: no amount or date options when no case has one.
  const hasAmount = s.casos.some((c) => c.monto !== null);
  const hasDate = s.casos.some((c) => c.fecha);
  const orders = CASE_ORDERS.filter(
    (o) => o === "relevantes" || ((o === "mayor" || o === "menor") && hasAmount) || ((o === "reciente" || o === "antiguo") && hasDate),
  );
  const [order, setOrder] = useUrlOption("orden", orders, "relevantes");
  const casos = sortCases(s.casos, order);

  return (
    <TrackedSheet title={s.tema} trackId={`signal.${s.id}`} onClose={onClose}>
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
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <h4 className="text-body-semibold">{s.casosTitulo}</h4>
                  <span className="text-caption-1-regular text-text-tertiary">Tocá un caso para ver el detalle completo</span>
                </div>
                {s.casos.length > 3 && orders.length > 1 && <CaseOrderMenu orders={orders} value={order} onChange={setOrder} />}
              </div>
              <ul className={listVariants()}>
                {casos.map((c) => (
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
