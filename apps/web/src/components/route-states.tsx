import { Alert } from "@mt/ui/components/alert";
import { Button, buttonClassName } from "@mt/ui/components/base/buttons/button";
import { RiRefreshLine } from "@remixicon/react";
import { type ErrorComponentProps, Link, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { captureError } from "@/analytics.ts";

/**
 * Shown when a page fails to load or to render (the router's error boundary): the rest of the site keeps
 * working, the error goes to PostHog, and the person can retry or tell us.
 */
export function RouteError({ error }: ErrorComponentProps) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => captureError(error, { path, boundary: "route" }), [error, path]);
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-title-1-semibold tracking-tight">No pudimos mostrar esta página</h1>
      <Alert variant="warning" title="Algo falló al cargarla">
        Ya nos llegó el aviso del error. Probá de nuevo en unos segundos; si sigue pasando, contanos qué estabas mirando.
      </Alert>
      <div className="flex flex-wrap gap-2">
        {/* A full reload, not router.invalidate(): a tab left open across a deploy keeps the old JS while the data
            JSON is already new, and only a reload brings code that understands it. */}
        <Button leadingIcon={RiRefreshLine} onClick={() => window.location.reload()}>
          Reintentar
        </Button>
        <Link to="/participar" search={{ tipo: "error", pagina: path } as never} className={buttonClassName({ variant: "secondary" })}>
          Reportar el error
        </Link>
      </div>
    </div>
  );
}

/** Any address without a page: a clear way back instead of a blank screen. */
export function RouteNotFound() {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-title-1-semibold tracking-tight">No encontramos esta página</h1>
      <p className="text-text-secondary text-pretty">Puede que el enlace esté mal escrito o que la página haya cambiado de lugar.</p>
      <div className="flex flex-wrap gap-2">
        <Link to="/" className={buttonClassName()}>
          Ir al inicio
        </Link>
        <Link to="/fuentes" className={buttonClassName({ variant: "secondary" })}>
          Ver todas las fuentes
        </Link>
      </div>
    </div>
  );
}
