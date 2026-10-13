import { Alert } from "@mt/ui/components/alert";
import { Button } from "@mt/ui/components/button";
import { type ErrorComponentProps, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { RotateCw } from "lucide-react";
import { useEffect } from "react";

import { captureError } from "@/analytics.ts";

/**
 * Shown when a page fails to load or to render (the router's error boundary): the rest of the site keeps
 * working, the error goes to PostHog, and the person can retry or tell us.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => captureError(error, { path, boundary: "route" }), [error, path]);
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">No pudimos mostrar esta página</h1>
      <Alert variant="warning" title="Algo falló al cargarla">
        Ya nos llegó el aviso del error. Probá de nuevo en unos segundos; si sigue pasando, contanos qué estabas mirando.
      </Alert>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          onClick={() => {
            reset();
            void router.invalidate();
          }}
        >
          <RotateCw className="size-4" aria-hidden /> Reintentar
        </Button>
        <Button asChild>
          <Link to="/participar" search={{ tipo: "error", pagina: path } as never}>
            Reportar el error
          </Link>
        </Button>
      </div>
    </div>
  );
}

/** Any address without a page: a clear way back instead of a blank screen. */
export function RouteNotFound() {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">No encontramos esta página</h1>
      <p className="text-ink-2 text-pretty">Puede que el enlace esté mal escrito o que la página haya cambiado de lugar.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" asChild>
          <Link to="/">Ir al inicio</Link>
        </Button>
        <Button asChild>
          <Link to="/fuentes">Ver todas las fuentes</Link>
        </Button>
      </div>
    </div>
  );
}
