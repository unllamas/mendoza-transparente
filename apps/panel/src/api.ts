/**
 * Calls to the panel API (/api/panel/*). The Access session travels in a cookie; when it expires, Access
 * answers with a redirect to its login (or the function with 401), and the panel asks to log in again.
 */

import type { InboxItem, panelStats, ReviewStatus, SubmissionDetail, SubmissionType } from "@mt/participation/store";
import { useCallback, useEffect, useState } from "react";

export type { InboxItem, ReviewStatus, SubmissionDetail, SubmissionType };
export type PanelStats = Awaited<ReturnType<typeof panelStats>>;
export type Counts = Record<ReviewStatus | "all", number>;

export class SessionExpired extends Error {}
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly warnings: string[] = [],
  ) {
    super(message);
  }
}

/** Raised when the session expires, so the layout shows the "log in again" screen. */
export const SESSION_EXPIRED_EVENT = "panel:session-expired";

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, {
      method: init.method ?? "GET",
      // Access redirects to its login: a cross-origin redirect that fetch cannot follow. "manual" makes it visible.
      redirect: "manual",
      credentials: "same-origin",
      headers: init.body === undefined ? {} : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError("No hay conexión con el servidor. Probá de nuevo.", 0);
  }
  if (r.type === "opaqueredirect" || r.status === 401) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new SessionExpired("La sesión venció.");
  }
  const data = (await r.json().catch(() => null)) as (T & { error?: string; warnings?: string[] }) | null;
  if (!r.ok || !data) throw new ApiError(data?.error ?? "Algo falló en el servidor. Probá de nuevo.", r.status, data?.warnings);
  return data;
}

/** Loads `path` and reloads it on demand. `data` keeps the last result while reloading. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: version is the reload trigger
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    api<T>(path)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => !cancelled && !(e instanceof SessionExpired) && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [path, version]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, reload, setData };
}
