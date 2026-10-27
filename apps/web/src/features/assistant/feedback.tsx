import type { AssistantReply, FeedbackReason, Vote } from "@mt/assistant/types";
import { Button } from "@mt/ui/components/base/buttons/button";
import { IconButton } from "@mt/ui/components/base/buttons/icon-button";
import { listRowVariants, listVariants } from "@mt/ui/components/card";
import { cx } from "@mt/ui/lib/cx";
import { RiCloseLine, RiThumbDownFill, RiThumbDownLine, RiThumbUpFill, RiThumbUpLine } from "@remixicon/react";
import { useEffect, useState } from "react";
import { track } from "@/analytics.ts";
import { sendFeedback } from "./api.ts";

const NOTE_MAX = 500;

const REASONS: { value: FeedbackReason; label: string }[] = [
  { value: "dato", label: "Un dato está mal" },
  { value: "respuesta", label: "No respondió lo que pregunté" },
  { value: "falta", label: "Falta información o un paso" },
];

/** A few light-blue sparks that fly out of the thumb and fade. Tailwind transitions only, so no extra library. */
function Burst() {
  const [go, setGo] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGo(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <span className="pointer-events-none absolute inset-0 motion-reduce:hidden" aria-hidden>
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <span
          key={deg}
          className={cx(
            "absolute top-1/2 left-1/2 size-1.5 rounded-full bg-accent-400 transition-[transform,opacity] duration-500 ease-out",
            go ? "opacity-0" : "opacity-100",
          )}
          style={{ transform: `translate(-50%, -50%) rotate(${deg}deg) translateY(${go ? -18 : 0}px)` }}
        />
      ))}
    </span>
  );
}

/** Thumb button: 32 px to the eye, 44 px to the finger (the ::after widens the target). Liking it pops and sparks. */
function Thumb({ kind, on, onPress }: { kind: Vote; on: boolean; onPress: () => void }) {
  const [pop, setPop] = useState(0);
  const [big, setBig] = useState(false);
  const Icon = kind === "up" ? (on ? RiThumbUpFill : RiThumbUpLine) : on ? RiThumbDownFill : RiThumbDownLine;
  return (
    <button
      type="button"
      aria-label={kind === "up" ? "La respuesta me sirvió" : "La respuesta no me sirvió"}
      aria-pressed={on}
      onClick={() => {
        if (!on && kind === "up") {
          setPop((n) => n + 1);
          setBig(true);
          setTimeout(() => setBig(false), 160);
        }
        onPress();
      }}
      className={cx(
        "relative flex size-8 items-center justify-center rounded-lg transition-colors after:absolute after:-inset-1.5",
        on ? "text-text-action" : "text-text-tertiary hover:bg-background-secondary-hover hover:text-text-secondary",
      )}
    >
      <Icon
        className={cx("size-4 transition-transform duration-150 ease-out", big && "motion-safe:-rotate-12 motion-safe:scale-150")}
        aria-hidden
      />
      {on && kind === "up" && pop > 0 && <Burst key={pop} />}
    </button>
  );
}

/** Thumbs-down form: three reasons and an optional note, as a bottom sheet over the panel. */
function FeedbackSheet({ onSend, onClose }: { onSend: (reason: FeedbackReason, note: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState<FeedbackReason | null>(null);
  const [note, setNote] = useState("");
  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end">
      <button type="button" aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div
        role="dialog"
        aria-label="¿Qué estuvo mal?"
        className="relative flex flex-col gap-5 rounded-t-3xl bg-background-full px-5 pb-5 shadow-2xl"
      >
        <span className="mx-auto mt-2 h-1 w-10 rounded-full bg-border-button-default" aria-hidden />
        <div className="-mt-3 flex h-14 items-center">
          <span className="mr-auto text-headline-medium text-text-primary">¿Qué estuvo mal?</span>
          <IconButton icon={RiCloseLine} aria-label="Cerrar" onClick={onClose} />
        </div>
        <div role="radiogroup" aria-label="Motivo" className={listVariants()}>
          {REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              role="radio"
              aria-checked={reason === r.value}
              onClick={() => setReason(r.value)}
              className={cx(listRowVariants(), reason === r.value && "bg-background-action hover:bg-background-action")}
            >
              <span
                className={cx(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                  reason === r.value ? "border-text-action" : "border-border-button-default",
                )}
                aria-hidden
              >
                {reason === r.value && <span className="size-2.5 rounded-full bg-text-action" />}
              </span>
              <span className={cx("min-w-0 flex-1 text-body-regular", reason === r.value ? "text-text-action" : "text-text-primary")}>
                {r.label}
              </span>
            </button>
          ))}
        </div>
        <textarea
          aria-label="Contanos más (opcional)"
          placeholder="Contanos más (opcional)"
          rows={3}
          maxLength={NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full resize-none rounded-2xl bg-background-surface px-4 py-3 shadow-card text-body-regular text-text-primary outline-none placeholder:text-text-tertiary focus-visible:ring-2 focus-visible:ring-border-focus-ring max-sm:text-base"
        />
        <Button
          disabled={!reason}
          onClick={() => reason && onSend(reason, note.trim())}
          className="w-full disabled:bg-background-secondary-hover"
        >
          Enviar
        </Button>
      </div>
    </div>
  );
}

/** Minutes ago in words, for the line under an answer. */
function relativeTime(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `hace ${hours} h` : "hace más de un día";
}

/** Under each answer: when it was given and two small thumbs. Up sparks; down opens the form. No thank-you text. */
export function AnswerFooter({ reply, at, now }: { reply: AssistantReply; at: number; now: number }) {
  const [vote, setVote] = useState<Vote | null>(null);
  const [asking, setAsking] = useState(false);
  const context = { flow: reply.flow, municipality: reply.municipality, outcome: reply.outcome };

  const voteUp = () => {
    if (vote === "up") return;
    setVote("up");
    sendFeedback({ vote: "up", ...context });
    track("assistant.feedback.vote", { vote: "up" });
  };

  return (
    <div className="flex items-center gap-1">
      <span className="mr-auto text-caption-1-regular text-text-tertiary">{relativeTime(at, now)}</span>
      <Thumb kind="up" on={vote === "up"} onPress={voteUp} />
      <Thumb kind="down" on={vote === "down"} onPress={() => vote !== "down" && setAsking(true)} />
      {asking && (
        <FeedbackSheet
          onClose={() => setAsking(false)}
          onSend={(reason, note) => {
            setVote("down");
            setAsking(false);
            sendFeedback({ vote: "down", reason, ...(note ? { note: note.slice(0, NOTE_MAX) } : {}), ...context });
            // The free note never goes to analytics: only the vote and the reason.
            track("assistant.feedback.vote", { vote: "down", reason });
          }}
        />
      )}
    </div>
  );
}
