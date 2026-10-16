/**
 * "Compartir": shares the current page with its text already written and the #MendozaTransparente hashtag.
 * - The text is the page's description (the same one search engines and link previews show), unless the caller
 *   passes its own (a request in "Lo que no se publica").
 * - The link keeps the URL parameters, so an open sheet (`?dato=`, `?proceso=`) is shared as it is.
 * - On a phone it opens the system share sheet; elsewhere, a menu with X, WhatsApp and copy.
 * Documented in docs/procesos/web.md.
 */

import { buttonClassName } from "@mt/ui/components/base/buttons/button";
import { Dropdown, DropdownPopover, DropdownTrigger } from "@mt/ui/components/base/dropdown/dropdown";
import { MENU_ITEM, MENU_ITEM_INTERACTIVE } from "@mt/ui/components/base/dropdown/menu-styles";
import { cx } from "@mt/ui/lib/cx";
import { RiCheckLine, RiFileCopyLine, RiShareForwardLine, RiTwitterXLine, RiWhatsappLine } from "@remixicon/react";
import { useRouterState } from "@tanstack/react-router";
import { useState } from "react";

import { SITE_URL } from "@/seo.ts";

export const HASHTAG = "#MendozaTransparente";

/** X counts every link as 23 characters; this leaves room for it, a space and the hashtag. */
const X_LIMIT = 280 - 24 - (HASHTAG.length + 1);

/** Cuts the text at a word so the post fits in X, with an ellipsis if something was left out. */
function fit(text: string, max = X_LIMIT): string {
  let clean = text.replace(/\s+/g, " ").trim();
  // Page descriptions come already cut for search engines ("…(Elegí…"): keep only the whole sentences.
  const lastStop = clean.lastIndexOf(". ");
  if (clean.endsWith("…") && lastStop > 0) clean = clean.slice(0, lastStop + 1);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,.;:]+$/, "")}…`;
}

const pageDescription = () => document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? "";

export function ShareButton({ text, id = "compartir", context }: { text?: string; id?: string; context?: string }) {
  const href = useRouterState({ select: (s) => s.location.href });
  const [copied, setCopied] = useState(false);
  // The page's description is set by usePageMeta after the route renders (for data pages, after a fetch): it is
  // read when the person opens the menu or taps, never on render.
  const [body, setBody] = useState("");
  const compose = () => `${fit(text ?? pageDescription())} ${HASHTAG}`;
  const url = `${SITE_URL}${href}`;
  const where = context ?? "page";

  const nativeShare = () => void navigator.share({ text: compose(), url }).catch(() => {});
  const copy = async () => {
    await navigator.clipboard.writeText(`${compose()} ${url}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const label = (
    <>
      <RiShareForwardLine className="size-5" aria-hidden /> Compartir
    </>
  );
  const triggerClass = buttonClassName({ variant: "secondary", className: "w-fit shrink-0" });

  // Phones get the system sheet (WhatsApp, X, Instagram… whatever the person has installed).
  if (typeof navigator !== "undefined" && "share" in navigator && window.matchMedia("(pointer: coarse)").matches) {
    return (
      <button type="button" id={id} onClick={nativeShare} data-track="share.native" data-track-context={where} className={triggerClass}>
        {label}
      </button>
    );
  }

  const row = cx(MENU_ITEM, MENU_ITEM_INTERACTIVE, "min-h-11 text-body-medium");
  return (
    <Dropdown onOpenChange={(open) => open && setBody(compose())}>
      <DropdownTrigger id={id} className={triggerClass}>
        {label}
      </DropdownTrigger>
      <DropdownPopover aria-label="Compartir">
        <a
          href={`https://x.com/intent/post?text=${encodeURIComponent(body)}&url=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noreferrer"
          data-track="share.x"
          data-track-context={where}
          className={row}
        >
          <RiTwitterXLine className="size-5 text-foreground-icon-secondary" aria-hidden /> Publicar en X
        </a>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${body}\n${url}`)}`}
          target="_blank"
          rel="noreferrer"
          data-track="share.whatsapp"
          data-track-context={where}
          className={row}
        >
          <RiWhatsappLine className="size-5 text-foreground-icon-secondary" aria-hidden /> Enviar por WhatsApp
        </a>
        <button type="button" onClick={copy} data-track="share.copy" data-track-context={where} className={row}>
          {copied ? (
            <RiCheckLine className="size-5 text-foreground-icon-secondary" aria-hidden />
          ) : (
            <RiFileCopyLine className="size-5 text-foreground-icon-secondary" aria-hidden />
          )}
          {copied ? "Copiado" : "Copiar texto y link"}
        </button>
      </DropdownPopover>
    </Dropdown>
  );
}
