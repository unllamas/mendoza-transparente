import type { PublicCorrection, PublicRequest } from "@mt/participation/store";
import { useEffect, useState } from "react";

export type { PublicCorrection, PublicRequest };

export interface Registry {
  requests: PublicRequest[];
  corrections: PublicCorrection[];
  updatedAt: string;
}

/**
 * The public registry: requests and corrections the team reviewed and published (GET /api/registro).
 * It is live data, not part of the build, so it is fetched on the page. `undefined` while loading; `null`
 * if the API did not answer.
 */
export function useRegistry(): Registry | null | undefined {
  const [registry, setRegistry] = useState<Registry | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/registro")
      .then((r) => (r.ok && r.headers.get("content-type")?.includes("json") ? (r.json() as Promise<Registry>) : null))
      .then((data) => !cancelled && setRegistry(data))
      .catch(() => !cancelled && setRegistry(null));
    return () => {
      cancelled = true;
    };
  }, []);
  return registry;
}
