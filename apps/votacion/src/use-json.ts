import { useEffect, useState } from "react";

type State<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error" };

const cache = new Map<string, Promise<unknown>>();

/** Fetches a JSON from public/datos once per session; `null` path waits. */
export function useJson<T>(path: string | null): State<T> {
  const [state, setState] = useState<State<T>>({ status: "loading" });
  useEffect(() => {
    if (!path) return;
    let alive = true;
    setState({ status: "loading" });
    let request = cache.get(path);
    if (!request) {
      request = fetch(path).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      });
      request.catch(() => cache.delete(path));
      cache.set(path, request);
    }
    request.then(
      (data) => alive && setState({ status: "ready", data: data as T }),
      () => alive && setState({ status: "error" }),
    );
    return () => {
      alive = false;
    };
  }, [path]);
  return state;
}
