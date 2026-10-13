/**
 * Analytics: one small layer between the site and the provider (PostHog today), so the provider can be
 * swapped by editing only this file. Documented in docs/procesos/analitica.md.
 *
 * - No key (VITE_POSTHOG_KEY unset, e.g. in development) → nothing is loaded or sent.
 * - Cookieless (`cookieless_mode: "always"`): no cookies, localStorage or sessionStorage, so no consent banner
 *   is needed. PostHog's servers derive the visitor from a hash of IP + browser + domain with a salt that
 *   changes every day, without storing the IP. Requires "cookieless server hash mode" on in the project
 *   (cookieless_server_hash_mode = 2); otherwise PostHog drops the events. Before this, `persistence: "memory"`
 *   counted every page load as a new visitor.
 * - Errors: PostHog's exception autocapture, plus `captureError` for the ones React catches (error boundaries
 *   do not reach window.onerror). Errors that happen before PostHog loads are queued and sent once it does.
 * - Events are named `area.element.action`, in English snake_case (catalog in the docs). Clicks on any
 *   element with `data-track="…"` are sent automatically, with every `data-track-*` attribute as a property.
 */

type Props = Record<string, string | number | boolean | null | undefined>;

interface Provider {
  capture: (event: string, props?: Props) => void;
  captureException: (error: unknown, props?: Props) => void;
}

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://us.i.posthog.com";

let provider: Provider | null = null;
const queue: [string, Props | undefined][] = [];
const errorQueue: [unknown, Props | undefined][] = [];

/** PostHog loads after the page has loaded and the browser is idle, so it never competes with the content. */
function whenIdle(run: () => void) {
  const idle = () => ("requestIdleCallback" in window ? window.requestIdleCallback(run, { timeout: 4000 }) : setTimeout(run, 1500));
  if (document.readyState === "complete") idle();
  else window.addEventListener("load", idle, { once: true });
}

if (KEY && typeof window !== "undefined") {
  // Until PostHog loads (it is deferred), uncaught errors are queued here so they are not lost.
  const early = (error: unknown) => !provider && errorQueue.push([error, { early: true }]);
  window.addEventListener("error", (e) => early(e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => early(e.reason));
  whenIdle(
    () =>
      void import("posthog-js").then(({ default: posthog }) => {
        posthog.init(KEY, {
          api_host: HOST,
          cookieless_mode: "always",
          autocapture: false,
          capture_pageview: false, // sent by trackPageview on every route change
          capture_pageleave: true,
          disable_session_recording: true,
          capture_dead_clicks: false,
          // Uncaught errors and rejected promises become `$exception` events (Error tracking in PostHog).
          capture_exceptions: true,
          // No `ip: false`: the cookieless hash needs the IP at ingestion (events without it are dropped).
          // PostHog deletes it right after hashing, and the project also anonymizes IPs.
        });
        provider = {
          capture: (event, props) => posthog.capture(event, props),
          captureException: (error, props) => posthog.captureException(error, props),
        };
        for (const [event, props] of queue.splice(0)) provider.capture(event, props);
        for (const [error, props] of errorQueue.splice(0)) provider.captureException(error, props);
      }),
  );
}

/** Sends an event. Safe to call anywhere; it is a no-op without a provider. */
export function track(event: string, props?: Props) {
  if (import.meta.env.DEV && import.meta.env.VITE_TRACK_DEBUG) console.debug("[track]", event, props);
  if (!KEY) return;
  if (provider) provider.capture(event, props);
  else queue.push([event, props]);
}

/** Reports an error to PostHog (Error tracking). Use it where React catches errors: the router's error component. */
export function captureError(error: unknown, props?: Props) {
  if (import.meta.env.DEV) console.error("[captureError]", error, props);
  if (!KEY) return;
  if (provider) provider.captureException(error, props);
  else errorQueue.push([error, props]);
}

export function trackPageview(path: string) {
  track("$pageview", { $current_url: window.location.href, path });
}

/** Sends every click on `[data-track]` elements (installed once, in main.tsx). */
export function installClickTracking() {
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target as Element | null;
      const el = target?.closest<HTMLElement>("[data-track]");
      if (!el) {
        // Without an explicit id: downloads and links to other sites (official sources, PDFs) are still sent.
        const a = target?.closest<HTMLAnchorElement>("a[href]");
        if (!a) return;
        const url = new URL(a.href, window.location.href);
        const text = (a.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
        if (/\.(csv|json|xlsx?|zip|pdf)$/i.test(url.pathname) && url.origin === window.location.origin)
          track("data.download", { path: window.location.pathname, file: url.pathname });
        else if (url.origin !== window.location.origin)
          track("link.outbound", { path: window.location.pathname, href: url.href, host: url.host, text });
        return;
      }
      const props: Props = { path: window.location.pathname };
      for (const [k, v] of Object.entries(el.dataset)) {
        if (k.startsWith("track") && k !== "track") props[k.slice(5, 6).toLowerCase() + k.slice(6)] = v;
      }
      if (el instanceof HTMLAnchorElement && el.href) props.href = el.href;
      track(el.dataset.track!, props);
    },
    { capture: true },
  );
}
