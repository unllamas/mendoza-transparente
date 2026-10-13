/**
 * State that lives in the URL, so any view can be shared as it is: the tab of a page (`/municipios?ver=personal`),
 * a search (`/leyes?q=expropiación`), the department selected on a map. Documented in docs/procesos/web.md.
 *
 * - Changing it replaces the history entry (tabs are not "pages" for the back button) and keeps the scroll.
 * - The default value is not written: `/municipios` and `/municipios?ver=poblacion` are the same view.
 * - Other parameters (`?senal=`, `?proceso=`) are kept.
 */

import { useRouter, useRouterState } from "@tanstack/react-router";
import { useCallback } from "react";

/** Builds the current URL with each key set to its value (or removed when null or empty). */
function withParams(changes: Record<string, string | null>): string {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === "") url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
const withParam = (key: string, value: string | null) => withParams({ [key]: value });

/** Changes several parameters in one step (two separate changes in a row could overwrite each other). */
export function useSetUrlParams() {
  const router = useRouter();
  return useCallback(
    (changes: Record<string, string | null>) => void router.navigate({ href: withParams(changes), replace: true, resetScroll: false }),
    [router],
  );
}

/** Reads a search parameter as text (the router parses "2024" or "30717479188" as numbers). */
function useParam(key: string): string | null {
  return useRouterState({
    select: (s) => {
      const v = (s.location.search as Record<string, unknown>)[key];
      return typeof v === "string" || typeof v === "number" ? String(v) : null;
    },
  });
}

/** One of a fixed set of options (a tab, an order); anything else in the URL falls back to the default. */
export function useUrlOption<T extends string>(key: string, options: readonly T[], fallback: T): [T, (value: T) => void] {
  const router = useRouter();
  const raw = useParam(key);
  const value = raw !== null && (options as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const set = useCallback(
    (v: T) => void router.navigate({ href: withParam(key, v === fallback ? null : v), replace: true, resetScroll: false }),
    [router, key, fallback],
  );
  return [value, set];
}

/** Free text (a search) or an id that may be absent (the department selected on a map). */
export function useUrlText(key: string): [string, (value: string | null) => void] {
  const router = useRouter();
  const value = useParam(key) ?? "";
  const set = useCallback(
    (v: string | null) => void router.navigate({ href: withParam(key, v || null), replace: true, resetScroll: false }),
    [router, key],
  );
  return [value, set];
}
