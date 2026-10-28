/**
 * Cloudflare Turnstile widget (anti-spam). Used by the forms of /participar and by the assistant, once per
 * conversation. Without VITE_TURNSTILE_SITE_KEY (development) it renders nothing.
 */

import { useEffect, useRef } from "react";

export const TURNSTILE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
let turnstileScript: Promise<void> | null = null;

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; remove: (id: string) => void };
  }
}

export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!TURNSTILE_KEY || !ref.current) return;
    turnstileScript ??= new Promise<void>((resolve) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = () => resolve();
      document.head.appendChild(s);
    });
    let id: string | null = null;
    void turnstileScript.then(() => {
      if (!ref.current || !window.turnstile) return;
      id = window.turnstile.render(ref.current, {
        sitekey: TURNSTILE_KEY,
        language: "es",
        theme: "auto",
        callback: (t: string) => onToken(t),
        "expired-callback": () => onToken(null),
      });
    });
    return () => {
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [onToken]);
  return TURNSTILE_KEY ? <div ref={ref} /> : null;
}
