import { Button } from "@mt/ui/components/base/buttons/button";
import { ChoiceTiles } from "@mt/ui/components/choice-tiles";
import { SearchSelect } from "@mt/ui/components/search-select";
import { PageHeader } from "@mt/ui/components/section";
import { Segmented } from "@mt/ui/components/segmented";
import { cx } from "@mt/ui/lib/cx";
import { RiDownloadLine, RiFilePdf2Line, RiImageLine, RiShareLine } from "@remixicon/react";
import { useMemo, useRef, useState } from "react";
import { track } from "@/analytics.ts";
import { saveBlob } from "@/lib.ts";
import { TRANSPARENCY_ITEMS } from "@/transparency-items.ts";
import type { PosterMunicipality, TransparencyItemId } from "@/types.ts";
import { useUrlOption, useUrlText } from "@/url-state.ts";
import { a4Pdf, posterPng } from "../utils/export.ts";
import { missingItems, POSTER_TOPICS, posterContent, posterTopics } from "./poster-content.tsx";
import { type PosterFormat, PosterView } from "./poster-view.tsx";

const FORMATS: { value: PosterFormat; label: string }[] = [
  { value: "a4", label: "Para imprimir" },
  { value: "square", label: "Cuadrado" },
  { value: "story", label: "Historia" },
];

const FORMAT_HINT: Record<PosterFormat, string> = {
  a4: "Hoja A4 para imprimir.",
  square: "1080 × 1080, para publicaciones de Instagram, X y Facebook.",
  story: "1080 × 1920, para estados de WhatsApp e historias de Instagram.",
};

/** Width in pixels of the exported image: A4 at 150 dpi, 1080 for social media. */
const PIXELS: Record<PosterFormat, number> = { a4: 1240, square: 1080, story: 1080 };

/** /cartel: pick a municipality, what to show and the format; download it (PDF or image) or share it. */
export function PosterBuilder({ municipalities }: { municipalities: PosterMunicipality[] }) {
  const [slug, setSlug] = useUrlText("municipio");
  const m = municipalities.find((x) => x.slug === slug) ?? municipalities[0]!;
  const [topicParam, setTopic] = useUrlOption("tema", POSTER_TOPICS, "publica");
  const [format, setFormat] = useUrlOption("formato", ["a4", "square", "story"] as const, "a4");
  const [missingParam, setMissing] = useUrlText("dato");
  const missing = missingItems(m);
  const missingId = (missing.find((i) => i.id === missingParam) ?? missing.find((i) => i.id === "sueldos") ?? missing[0])?.id;
  const topics = posterTopics(m);
  const topic = topics.some((t) => t.value === topicParam) ? topicParam : "publica";
  const content = posterContent(m, topic, missingId ?? "sueldos", window.location.origin);
  const items = useMemo(() => municipalities.map((x) => ({ id: x.slug, label: x.name })), [municipalities]);
  const exportRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"pdf" | "png" | "share" | null>(null);
  const [failed, setFailed] = useState(false);

  const fileName = `cartel-${m.slug}-${topic === "falta" ? missingId : topic}`;
  async function run(kind: "pdf" | "png" | "share") {
    if (!exportRef.current) return;
    setBusy(kind);
    setFailed(false);
    try {
      const png = await posterPng(exportRef.current);
      if (kind === "pdf") saveBlob(await a4Pdf(png), `${fileName}.pdf`);
      else if (kind === "png") saveBlob(png, `${fileName}.png`);
      else {
        const file = new File([png], `${fileName}.png`, { type: "image/png" });
        // Phones share the image itself (WhatsApp, Instagram…); where that is not possible, it is downloaded.
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: `${content.question} ${content.qrUrl}` });
        else saveBlob(png, `${fileName}.png`);
      }
      track("poster.export", { municipality: m.slug, topic, item: topic === "falta" ? missingId : undefined, format, kind });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setFailed(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={RiImageLine} title="Hacé un cartel">
        Elegí tu municipio y qué querés mostrar. Imprimilo para pegarlo en el barrio o compartilo en redes: cada dato lleva su fuente y un
        QR.
      </PageHeader>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <SearchSelect
            label="1. Municipio"
            items={items}
            value={m.slug}
            onChange={setSlug}
            placeholder="Buscá un municipio"
            id="cartel-municipio"
            onOpen={() => track("poster.municipality_picker.open")}
          />
          <div className="flex flex-col gap-2">
            <span className="font-medium">2. ¿Qué querés mostrar?</span>
            <ChoiceTiles label="Qué querés mostrar" options={topics} value={topic} onChange={setTopic} />
            {topic === "falta" && missing.length > 1 && (
              <div className="mt-2 flex flex-col gap-2">
                <span className="text-caption-1-regular text-text-tertiary">Cuál de los que no publica:</span>
                <Segmented
                  label="Qué dato"
                  options={missing.map((i) => ({ value: i.id, label: TRANSPARENCY_ITEMS[i.id].label }))}
                  value={missingId as TransparencyItemId}
                  onChange={setMissing}
                />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-medium">3. Formato</span>
            <Segmented label="Formato" options={FORMATS} value={format} onChange={setFormat} />
            <span className="text-caption-1-regular text-text-tertiary">{FORMAT_HINT[format]}</span>
          </div>
        </div>

        <div
          className={cx(
            "mx-auto flex w-full min-w-0 flex-col gap-2 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1",
            format === "story" ? "max-w-80" : "max-w-md",
          )}
        >
          <span className="text-caption-1-regular text-text-tertiary">Vista del cartel</span>
          <div className="shadow-sm ring-1 ring-separator-border">
            <PosterView content={content} format={format} />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2 lg:col-start-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {format === "a4" ? (
              <Button variant="primary" leadingIcon={RiFilePdf2Line} onClick={() => run("pdf")} disabled={busy !== null} id="cartel-pdf">
                {busy === "pdf" ? "Armando el PDF…" : "Descargar PDF"}
              </Button>
            ) : (
              <Button
                variant="primary"
                leadingIcon={RiShareLine}
                onClick={() => run("share")}
                disabled={busy !== null}
                id="cartel-compartir"
              >
                {busy === "share" ? "Preparando…" : "Compartir"}
              </Button>
            )}
            <Button variant="secondary" leadingIcon={RiDownloadLine} onClick={() => run("png")} disabled={busy !== null} id="cartel-imagen">
              {busy === "png" ? "Armando la imagen…" : "Descargar imagen"}
            </Button>
          </div>
          <p className={cx("text-caption-1-regular text-pretty", failed ? "text-text-primary" : "text-text-tertiary")}>
            {failed
              ? "No se pudo armar el cartel. Probá de nuevo."
              : `En el celular, «Compartir» abre WhatsApp, Instagram y las demás apps con la imagen adjunta. El QR lleva a ${content.qrUrl.includes("/pedir") ? "la nota para pedir el dato" : "la página del municipio"}.`}
          </p>
        </div>
      </div>

      {/* The same poster at its real size, off screen: this is what becomes the image or the PDF. */}
      <div aria-hidden className="pointer-events-none fixed top-0 -left-[3000px]" style={{ width: PIXELS[format] }} inert>
        <div ref={exportRef}>
          <PosterView content={content} format={format} />
        </div>
      </div>
    </div>
  );
}
