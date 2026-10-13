import { useEffect, useState } from "react";

export interface RequestStats {
  items: Record<string, { requests: number; answered: number; denied: number; overdue: number }>;
  total: { requests: number; answered: number; denied: number; overdue: number };
}

/** Public counters of the requests people filed (null while loading or if the API is not available). */
export function useRequestStats(): RequestStats | null {
  const [stats, setStats] = useState<RequestStats | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/pedidos/stats")
      .then((r) => (r.ok && r.headers.get("content-type")?.includes("json") ? (r.json() as Promise<RequestStats>) : null))
      .then((s) => !cancelled && setStats(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return stats;
}
