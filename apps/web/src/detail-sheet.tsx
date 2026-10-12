/**
 * Purchase process and supplier sheets driven by the URL: `?proceso=<ocid>` or `?proveedor=<cuit>` opens the
 * sheet over any page, so every case can be shared and opened directly ("/organismos/x?proceso=ocds-…").
 * Moving from a process to a supplier pushes a history entry: the back button goes back to the process.
 * Mounted once in the layout. Documented in docs/procesos/web.md.
 */

import { useRouter, useRouterState } from "@tanstack/react-router";

import { Sheet } from "./pages/components.tsx";
import { Proceso, Proveedor } from "./pages/detalle.tsx";

type DetailParam = "proceso" | "proveedor";
const PARAMS: DetailParam[] = ["proceso", "proveedor"];

/** Opens and closes detail sheets by changing the URL (keeps any other parameter, like `senal`). */
export function useDetail() {
  const router = useRouter();
  const href = (change: Partial<Record<DetailParam, string | null>>) => {
    const url = new URL(window.location.href);
    for (const p of PARAMS) url.searchParams.delete(p);
    for (const [k, v] of Object.entries(change)) if (v) url.searchParams.set(k, v);
    return `${url.pathname}${url.search}${url.hash}`;
  };
  return {
    // resetScroll: false keeps the page where it was under the sheet (the router scrolls to the top by default).
    open: (param: DetailParam, id: string) => router.navigate({ href: href({ [param]: id }), resetScroll: false }),
    close: () => router.navigate({ href: href({}), replace: true, resetScroll: false }),
  };
}

/** The sheet itself: reads the URL and shows the process or the supplier. */
export function DetailSheet() {
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const { open, close } = useDetail();
  // The router parses numeric values: a CUIT like 30717479188 arrives as a number.
  const asId = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : null);
  const proceso = asId(search.proceso);
  const proveedor = asId(search.proveedor);
  if (!proceso && !proveedor) return null;
  return (
    <Sheet titulo={proceso ? "Proceso de compra" : "Proveedor"} onClose={close} trackId={proceso ? "purchase.process" : "purchase.supplier"}>
      {proceso ? (
        <Proceso key={proceso} ocid={proceso} onProveedor={(cuit) => open("proveedor", cuit)} />
      ) : (
        <Proveedor key={proveedor!} cuit={proveedor!} onProceso={(ocid) => open("proceso", ocid)} />
      )}
    </Sheet>
  );
}
