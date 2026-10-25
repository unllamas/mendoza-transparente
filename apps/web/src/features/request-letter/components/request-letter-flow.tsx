import { Button } from "@mt/ui/components/base/buttons/button";
import { Checkbox } from "@mt/ui/components/base/checkbox/checkbox";
import { listRowVariants, listVariants, tileVariants } from "@mt/ui/components/card";
import { SearchSelect, type SearchSelectItem } from "@mt/ui/components/search-select";
import { PageHeader } from "@mt/ui/components/section";
import { cx } from "@mt/ui/lib/cx";
import { RiArrowLeftSLine, RiArrowRightLine, RiDownloadLine, RiFileTextLine, RiLockLine } from "@remixicon/react";
import { useEffect, useMemo, useState } from "react";
import { track } from "@/analytics.ts";
import { saveBlob } from "@/lib.ts";
import type { RequestTarget } from "@/types.ts";
import { useUrlText } from "@/url-state.ts";
import { EMPTY_REQUESTER, letterText, type Requester } from "../utils/letter.ts";
import { LetterPaper } from "./letter-paper.tsx";
import { NextStepsSheet } from "./next-steps-sheet.tsx";

/** Only on this device, and only if the person asks for it: so the next letter does not need the data typed again. */
const STORAGE_KEY = "mt-nota-datos";

function storedRequester(): Requester | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY_REQUESTER, ...(JSON.parse(raw) as Partial<Requester>) } : null;
  } catch {
    return null;
  }
}

/**
 * /pedir: step 1 picks who and what (?para=, then ?dato= with the chosen documents); step 2 is the letter, filled in on
 * the page and downloaded as a PDF made in the browser. A poster's QR links straight to step 2.
 */
export function RequestLetterFlow({ targets }: { targets: RequestTarget[] }) {
  const [targetParam, setTargetParam] = useUrlText("para");
  const [docsParam, setDocsParam] = useUrlText("dato");
  const target =
    targets.find((t) => t.id === targetParam) ?? targets.find((t) => t.documents.some((d) => d.id === docsParam)) ?? targets[0]!;
  const docIds = docsParam.split(",").filter((id) => target.documents.some((d) => d.id === id));
  return docIds.length ? (
    <WriteStep
      key={`${target.id}:${docIds.join(",")}`}
      target={target}
      docIds={docIds}
      onBack={() => {
        setTargetParam(target.id);
        setDocsParam(null);
      }}
    />
  ) : (
    <ChooseStep
      targets={targets}
      target={target}
      onTarget={(id) => setTargetParam(id)}
      onWrite={(ids) => {
        setTargetParam(target.id);
        setDocsParam(ids.join(","));
        window.scrollTo({ top: 0 });
      }}
    />
  );
}

function ChooseStep({
  targets,
  target,
  onTarget,
  onWrite,
}: {
  targets: RequestTarget[];
  target: RequestTarget;
  onTarget: (id: string) => void;
  onWrite: (ids: string[]) => void;
}) {
  const items = useMemo<SearchSelectItem[]>(() => targets.map((t) => ({ id: t.id, label: t.label, group: t.group })), [targets]);
  const missing = target.documents.filter((d) => d.missing).map((d) => d.id);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(missing));
  // A new recipient starts again from what it does not publish.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the recipient changes.
  useEffect(() => setChosen(new Set(missing)), [target.id]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <PageHeader icon={RiFileTextLine} title="Pedí información pública">
        Armá una nota formal en dos minutos. Es gratis, no hace falta abogado ni explicar para qué la querés, y tienen 15 días hábiles para
        responder.
      </PageHeader>
      <SearchSelect
        label="1. ¿A quién se lo pedís?"
        items={items}
        value={target.id}
        onChange={onTarget}
        placeholder="Buscá un municipio u organismo"
        id="nota-destinatario"
        onOpen={() => track("request_letter.target_picker.open")}
      />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-medium">2. ¿Qué le pedís?</legend>
        <span className="text-caption-1-regular text-text-tertiary text-pretty">
          {target.municipal ? "Marcamos lo que no encontramos publicado; podés elegir otras cosas." : "Lo que este organismo no publica."}{" "}
          En el paso siguiente podés cambiar el texto o sumar otros pedidos.
        </span>
        <ul className={listVariants()}>
          {target.documents.map((d) => (
            <li key={d.id} className={cx(listRowVariants(), "min-h-11 justify-between gap-3")}>
              <Checkbox
                isSelected={chosen.has(d.id)}
                onChange={(on) => {
                  const next = new Set(chosen);
                  if (on) next.add(d.id);
                  else next.delete(d.id);
                  setChosen(next);
                }}
              >
                {d.label}
              </Checkbox>
              {d.status && (
                <span className={cx("shrink-0 text-caption-1-regular", d.missing ? "text-text-primary" : "text-text-tertiary")}>
                  {d.status}
                </span>
              )}
            </li>
          ))}
        </ul>
      </fieldset>
      <Button
        variant="primary"
        trailingIcon={RiArrowRightLine}
        disabled={chosen.size === 0}
        onClick={() => onWrite(target.documents.filter((d) => chosen.has(d.id)).map((d) => d.id))}
        id="nota-armar"
        data-track="request_letter.write.start"
        data-track-target={target.id}
        data-track-documents={chosen.size}
        className="sm:w-fit"
      >
        Armar la nota
      </Button>
    </div>
  );
}

function WriteStep({ target, docIds, onBack }: { target: RequestTarget; docIds: string[]; onBack: () => void }) {
  const [points, setPoints] = useState(() => target.documents.filter((d) => docIds.includes(d.id)).map((d) => d.text));
  const [remember, setRemember] = useState(() => storedRequester() !== null);
  const [requester, setRequester] = useState<Requester>(() => storedRequester() ?? EMPTY_REQUESTER);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    try {
      if (remember) localStorage.setItem(STORAGE_KEY, JSON.stringify(requester));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Private mode: there is nowhere to remember them, and the letter still works.
    }
  }, [remember, requester]);

  const filled = points.filter((x) => x.trim()).length;

  async function download() {
    setBusy(true);
    setFailed(false);
    try {
      const { buildLetterPdf } = await import("../utils/pdf.ts");
      saveBlob(await buildLetterPdf(target, points, requester), `pedido-informacion-${target.id.replace(/^(muni|org)-/, "")}.pdf`);
      // Anonymous: who it goes to and how many points, never what the person wrote.
      track("request_letter.download", {
        target: target.id,
        documents: docIds.join(","),
        points: filled,
        custom_points: Math.max(0, filled - docIds.length),
        remembered: remember,
      });
      setDone(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-24">
      <div className="flex flex-col gap-3">
        <Button variant="tertiary" leadingIcon={RiArrowLeftSLine} onClick={onBack} id="nota-volver" className="-ml-3 w-fit">
          Cambiar a quién o qué pedís
        </Button>
        <h1 className="text-title-1-semibold tracking-tight text-balance">Completá la nota</h1>
        <p className="text-text-secondary text-pretty">
          Tocá cada espacio celeste y escribí. Lo que dejes vacío sale como una línea para completar a mano. Podés cambiar el texto de cada
          punto, quitarlo o sumar otro.
        </p>
      </div>

      <div className={cx(tileVariants(), "flex items-start gap-3")}>
        <RiLockLine className="mt-0.5 size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
        <div className="flex flex-col gap-2 text-body-regular">
          <span className="text-text-secondary text-pretty">
            Tus datos no salen de este dispositivo: la nota se arma acá y no los guardamos ni los vemos. Solo contamos, sin saber quién,
            cuántas notas se descargan y para qué organismo.
          </span>
          <Checkbox
            isSelected={remember}
            onChange={(on) => {
              setRemember(on);
              track("request_letter.remember.toggle", { on });
            }}
          >
            Recordar mis datos en este dispositivo para la próxima nota
          </Checkbox>
        </div>
      </div>

      <LetterPaper
        target={target}
        points={points}
        onPointsChange={setPoints}
        requester={requester}
        onRequesterChange={(k, v) => setRequester((r) => ({ ...r, [k]: v }))}
      />

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-separator-border bg-background-primary/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="min-w-0 truncate text-body-regular text-text-secondary max-sm:hidden">
            {failed ? "No se pudo armar el PDF. Probá de nuevo." : `Para ${target.label} · ${filled} ${filled === 1 ? "punto" : "puntos"}`}
          </span>
          <Button
            variant="primary"
            leadingIcon={RiDownloadLine}
            onClick={download}
            disabled={busy || filled === 0}
            id="nota-descargar"
            className="max-sm:w-full"
          >
            {busy ? "Armando el PDF…" : "Descargar PDF"}
          </Button>
        </div>
      </div>

      {done && <NextStepsSheet target={target} text={letterText(target, points, requester)} onClose={() => setDone(false)} />}
    </div>
  );
}
