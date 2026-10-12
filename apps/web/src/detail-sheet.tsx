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
    open: (param: DetailParam, id: string) => router.history.push(href({ [param]: id })),
    close: () => router.history.replace(href({})),
  };
}

/** The sheet itself: reads the URL and shows the process or the supplier. */
export function DetailSheet() {
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const { open, close } = useDetail();
  const proceso = typeof search.proceso === "string" ? search.proceso : null;
  const proveedor = typeof search.proveedor === "string" ? search.proveedor : null;
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
