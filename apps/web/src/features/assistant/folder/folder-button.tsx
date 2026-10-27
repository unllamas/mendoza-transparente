import { listRowVariants, listVariants } from "@mt/ui/components/card";
import { cx } from "@mt/ui/lib/cx";
import { RiFileDownloadLine } from "@remixicon/react";
import { useState } from "react";
import { track } from "@/analytics.ts";
import { saveBlob } from "@/lib.ts";
import { SITE_URL } from "@/seo.ts";
import type { StepsBlock } from "./content.ts";

const slug = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** "Bajar la carpeta del trámite": the PDF is made here, in the browser, and never leaves the device. */
export function FolderButton({ block }: { block: StepsBlock }) {
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");
  const press = async () => {
    setState("busy");
    try {
      const [{ buildFolderContent }, { buildFolderPdf }] = await Promise.all([import("./content.ts"), import("./pdf.ts")]);
      const content = buildFolderContent(block, SITE_URL, new Date().toISOString().slice(0, 10));
      const file = `carpeta-${slug(block.title ?? block.flow)}-${slug(block.municipality)}.pdf`;
      saveBlob(await buildFolderPdf(content), file);
      // A blob link is not seen by the site-wide download listener: the same event, sent by hand.
      track("data.download", { path: window.location.pathname, file });
      setState("idle");
    } catch {
      setState("failed");
    }
  };
  return (
    <ul className={listVariants()}>
      <li>
        <button type="button" onClick={press} disabled={state === "busy"} className={cx(listRowVariants(), "disabled:opacity-60")}>
          <RiFileDownloadLine className="size-5 shrink-0 text-text-link" aria-hidden />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-body-medium text-text-link">Bajar la carpeta del trámite</span>
            <span className="text-caption-1-regular text-pretty text-text-secondary" role={state === "failed" ? "alert" : undefined}>
              {state === "busy"
                ? "Armando el PDF…"
                : state === "failed"
                  ? "No se pudo armar. Probá de nuevo."
                  : "PDF, se arma en tu celular"}
            </span>
          </span>
        </button>
      </li>
    </ul>
  );
}
