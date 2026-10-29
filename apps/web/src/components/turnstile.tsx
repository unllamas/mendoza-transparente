/**
 * Widget de Cloudflare Turnstile (antispam). Lo usan los formularios de /participar y el asistente, una vez por
 * conversación. Sin VITE_TURNSTILE_SITE_KEY (desarrollo) no muestra nada. `onError` avisa si el script no carga
 * (un bloqueador, sin red) o si Turnstile falla o vence, para ofrecer un reintento en vez de dejar a la persona colgada.
 */

import { useEffect, useRef } from "react";

export const TURNSTILE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
let turnstileScript: Promise<void> | null = null;
/** Cuánto se espera al script antes de darlo por perdido: un bloqueador a veces lo frena sin disparar `onerror`. */
const SCRIPT_TIMEOUT_MS = 15_000;

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; remove: (id: string) => void };
  }
}

export function Turnstile({ onToken, onError }: { onToken: (token: string | null) => void; onError?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!TURNSTILE_KEY || !ref.current) return;
    turnstileScript ??= new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        // Sin caché del fallo: el próximo intento vuelve a pedir el script.
        s.remove();
        turnstileScript = null;
        reject(new Error("turnstile"));
      };
      document.head.appendChild(s);
    });
    let id: string | null = null;
    let cancelled = false;
    const timeout = setTimeout(() => !cancelled && !window.turnstile && onError?.(), SCRIPT_TIMEOUT_MS);
    turnstileScript.then(
      () => {
        clearTimeout(timeout);
        if (cancelled || !ref.current || !window.turnstile) return;
        id = window.turnstile.render(ref.current, {
          sitekey: TURNSTILE_KEY,
          language: "es",
          theme: "auto",
          callback: (t: string) => onToken(t),
          "expired-callback": () => onToken(null),
          "error-callback": () => onError?.(),
          "timeout-callback": () => onError?.(),
        });
      },
      () => {
        clearTimeout(timeout);
        if (!cancelled) onError?.();
      },
    );
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [onToken, onError]);
  return TURNSTILE_KEY ? <div ref={ref} /> : null;
}
