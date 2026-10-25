import { Button } from "@mt/ui/components/base/buttons/button";
import { tileVariants } from "@mt/ui/components/card";
import { cx } from "@mt/ui/lib/cx";
import { RiCheckLine, RiExternalLinkLine, RiFileCopyLine } from "@remixicon/react";
import { useState } from "react";
import { TrackedSheet } from "@/components/tracked-sheet.tsx";
import type { RequestTarget } from "@/types.ts";

/** After the download: how to file the letter, and its text to paste when it goes through an online form. */
export function NextStepsSheet({ target, text, onClose }: { target: RequestTarget; text: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const byMail = target.formUrl?.startsWith("mailto:");
  return (
    <TrackedSheet title="Listo: ya tenés la nota" onClose={onClose} trackId="request_letter.next_steps">
      <ol className="flex flex-col gap-4 text-body-regular">
        <li className="flex gap-3">
          <span className="font-semibold">1.</span>
          <span className="text-pretty">Imprimí dos copias y firmalas.</span>
        </li>
        <li className="flex flex-col gap-3">
          <span className="flex gap-3">
            <span className="font-semibold">2.</span>
            <span className="text-pretty">Presentala {target.where}.</span>
          </span>
          {target.formUrl && (
            <div className={cx(tileVariants(), "ml-6 flex flex-col gap-3")}>
              <span className="text-text-secondary text-pretty">
                {byMail
                  ? "¿Preferís mandarla por correo? Copiá el texto de la nota y pegalo en el mensaje."
                  : "¿Preferís hacerlo en línea? Copiá el texto de la nota y pegalo en el formulario oficial."}
              </span>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  variant="secondary"
                  leadingIcon={copied ? RiCheckLine : RiFileCopyLine}
                  id="nota-copiar-texto"
                  data-track="request_letter.text.copy"
                  data-track-target={target.id}
                  onClick={async () => {
                    await navigator.clipboard.writeText(text);
                    setCopied(true);
                  }}
                >
                  {copied ? "Texto copiado" : "Copiar el texto"}
                </Button>
                <a
                  href={target.formUrl}
                  target="_blank"
                  rel="noreferrer"
                  id="nota-formulario-oficial"
                  data-track="request_letter.official_form.open"
                  data-track-target={target.id}
                  className="inline-flex min-h-11 items-center gap-1 text-body-medium text-text-link hover:underline"
                >
                  {byMail ? "Escribir el correo" : "Abrir el formulario oficial"} <RiExternalLinkLine className="size-4" aria-hidden />
                </a>
              </div>
            </div>
          )}
        </li>
        <li className="flex gap-3">
          <span className="font-semibold">3.</span>
          <span className="text-pretty">
            Pedí que te sellen una copia con la fecha y el número de expediente: es tu constancia. Si a los 15 días hábiles no te
            respondieron, podés reclamar.
          </span>
        </li>
      </ol>
    </TrackedSheet>
  );
}
