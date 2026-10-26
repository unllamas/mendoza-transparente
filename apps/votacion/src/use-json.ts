import { useEffect, useState } from "react";

type State<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error" };

const cache = new Map<string, Promise<unknown>>();

function load(path: string) {
  let request = cache.get(path);
  if (!request) {
    request = fetch(path).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    request.catch(() => cache.delete(path));
    cache.set(path, request);
  }
  return request;
}

/** Fetches a JSON from public/datos once per session; `null` path waits. */
export function useJson<T>(path: string | null): State<T> {
  const [state, setState] = useState<State<T>>({ status: "loading" });
  useEffect(() => {
    if (!path) return;
    let alive = true;
    setState({ status: "loading" });
    load(path).then(
      (data) => alive && setState({ status: "ready", data: data as T }),
      () => alive && setState({ status: "error" }),
    );
    return () => {
      alive = false;
    };
  }, [path]);
  return state;
}

/** Several JSON at once (every election of a year); ready when all are. */
export function useJsonAll<T>(paths: string[]): State<T[]> {
  const [state, setState] = useState<State<T[]>>({ status: "loading" });
  const key = paths.join("|");
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    Promise.all(key ? key.split("|").map(load) : []).then(
      (data) => alive && setState({ status: "ready", data: data as T[] }),
      () => alive && setState({ status: "error" }),
    );
    return () => {
      alive = false;
    };
  }, [key]);
  return state;
}
