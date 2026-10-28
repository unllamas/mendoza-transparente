import type { Progress } from "@mt/assistant/types";
import { MUNICIPALITIES } from "@mt/assistant/types";
import { Mascot, MascotAvatar } from "@mt/mascots/mascot";
import { Button } from "@mt/ui/components/base/buttons/button";
import { IconButton } from "@mt/ui/components/base/buttons/icon-button";
import { RiArrowRightSLine, RiCloseLine, RiRestartLine, RiSendPlane2Line } from "@remixicon/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { activityIcon } from "./activity-icons.ts";
import { Andes } from "./andes.tsx";
import { type BlockHandlers, BlockView } from "./blocks.tsx";
import { AnswerFooter, type FeedbackSend, FeedbackSheet } from "./feedback.tsx";
import { currentPosition, municipalityAt } from "./locate.ts";
import { type SearchItem, SearchSheet } from "./search-sheet.tsx";
import { type ConversationError, progressText, type Turn } from "./use-conversation.ts";

export const NAME = "Aco";

/**
 * Short enough for one line at 320 px, and only what Aco can answer with what we have: a suggestion it then cannot
 * resolve is worse than none (Ingresos Brutos is not in the knowledge yet).
 */
const SUGGESTIONS = ["¿Cómo abro un comercio?", "¿Cuánto cobra mi municipio?", "¿Cuánto tarda la habilitación?"];

/** Answers that get the time and the thumbs; the ones that only ask something do not. */
const RATED = new Set(["steps", "fee", "unpublished", "answer"]);

function Header({ onClose, onRestart }: { onClose: () => void; onRestart?: () => void }) {
  return (
    <div className="flex h-16 shrink-0 items-center gap-3 border-b border-separator-border bg-background-surface pr-2 pl-4">
      <span className="relative shrink-0">
        <MascotAvatar mascot="aco" size={40} decorative />
        <span className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-background-surface bg-green-500" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body-semibold text-text-primary">{NAME}</span>
        {/* The AI notice lives here: always in sight, without taking a line under the composer. */}
        <span className="truncate text-caption-1-regular text-text-secondary">Responde con IA y datos oficiales</span>
      </span>
      {onRestart && <IconButton icon={RiRestartLine} aria-label="Empezar de nuevo" onClick={onRestart} />}
      <IconButton icon={RiCloseLine} aria-label="Cerrar la guía" onClick={onClose} />
    </div>
  );
}

/**
 * Welcome: the mascot over the Andes with two speech bubbles, like a postcard. Only before the first question: after
 * that the header already shows Aco, and the space is for the conversation.
 */
function Hero() {
  return (
    <div className="relative -mx-5 -mt-5 h-44 shrink-0 overflow-hidden bg-accent-50">
      <Andes />
      <Mascot mascot="aco" pose="wave" size={120} priority className="absolute top-1 left-1/2 -translate-x-1/2" />
      <p className="absolute top-24 left-5 -rotate-3 rounded-2xl rounded-bl-sm bg-background-surface px-3 py-1.5 text-body-bold text-text-primary shadow-md">
        ¡Hola! Soy {NAME} 👋
      </p>
      <p className="absolute top-32 right-5 rotate-2 rounded-2xl rounded-br-sm bg-accent-600 px-3 py-1.5 text-body-bold text-white shadow-md">
        Te ayudo con tus trámites
      </p>
    </div>
  );
}

function UserBubble({ children }: { children: ReactNode }) {
  return (
    <p className="max-w-[80%] self-end rounded-2xl rounded-br-sm bg-neutral-300/70 px-4 py-2.5 text-body-regular text-text-primary">
      {children}
    </p>
  );
}

/** Agent column: no bubble, 85% of the width, so its turns and the user's read as two sides. */
function BotTurn({ children }: { children: ReactNode }) {
  return <div className="flex w-[85%] max-w-[85%] flex-col gap-4 self-start">{children}</div>;
}

function BotText({ children }: { children: ReactNode }) {
  return <p className="text-body-regular text-pretty text-text-primary">{children}</p>;
}

/** Text with a small shy Aco beside it: for errors and for data that is not published. */
function ShyText({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-end gap-2">
      <Mascot mascot="aco" pose="shy" size={48} decorative className="shrink-0" />
      <BotText>{children}</BotText>
    </div>
  );
}

function Suggestions({ onAsk }: { onAsk: (q: string) => void }) {
  return (
    <div className="flex flex-col items-end gap-2">
      {SUGGESTIONS.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onAsk(q)}
          className="flex min-h-11 max-w-[85%] items-center gap-2 rounded-2xl border border-transparent bg-background-interactive py-2 pr-3 pl-4 text-left text-body-regular text-text-primary shadow-card transition-colors hover:border-border-link active:bg-background-interactive-hover"
        >
          <span className="min-w-0 text-balance">{q}</span>
          <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
        </button>
      ))}
    </div>
  );
}

/** Re-renders every 30 seconds so "hace 2 min" keeps up. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** What Aco is doing, right above the composer: a pulsing dot and a few words, never the mascot or a long sentence. */
function ProgressLine({ progress }: { progress: Progress | null }) {
  return (
    <p className="flex shrink-0 items-center gap-2 px-5 pt-2 text-caption-1-regular text-text-secondary">
      <span className="size-2 shrink-0 rounded-full bg-accent-500 motion-safe:animate-pulse" aria-hidden />
      <span className="truncate">{progressText(progress)}…</span>
    </p>
  );
}

const RETRY_COOLDOWN_MS = 10_000;

const ERROR_TEXT: Record<ConversationError, string> = {
  generic: "No pude responder esta vez. Probá de nuevo o empezá otra conversación.",
  "rate-limit": "Mandaste muchas preguntas seguidas. Esperá unos segundos y probá de nuevo.",
  challenge: "No pude comprobar que no sos un robot. Probá de nuevo.",
};

/** The error with its retry button. After a rate limit (10 requests every 10 s per IP) the button waits 10 s. */
function ErrorTurn({ error, onRetry }: { error: ConversationError; onRetry: () => void }) {
  const [waiting, setWaiting] = useState(error === "rate-limit");
  useEffect(() => {
    if (error !== "rate-limit") return;
    setWaiting(true);
    const id = setTimeout(() => setWaiting(false), RETRY_COOLDOWN_MS);
    return () => clearTimeout(id);
  }, [error]);
  return (
    <BotTurn>
      <ShyText>{ERROR_TEXT[error]}</ShyText>
      <Button variant="secondary" onClick={onRetry} disabled={waiting} className="self-start">
        Reintentar
      </Button>
    </BotTurn>
  );
}

/** The panel: header with the mascot, conversation, and the composer pinned at the bottom with Aco's progress over it. */
export function Panel({
  turns,
  thinking,
  progress,
  error,
  onSend,
  onRetry,
  onRestart,
  onClose,
  verification,
}: {
  turns: Turn[];
  thinking: boolean;
  progress: Progress | null;
  error: ConversationError | null;
  onSend: (text: string) => void;
  onRetry: () => void;
  onRestart: () => void;
  onClose: () => void;
  /** The Turnstile widget, while the conversation still has to prove it is a person. */
  verification?: ReactNode;
}) {
  const [draft, setDraft] = useState("");
  // The open picker, if any: the 18 municipalities or the activities of the last question.
  const [sheet, setSheet] = useState<null | { kind: "municipality" } | { kind: "activity"; items: (SearchItem & { id?: string })[] }>(null);
  // The thumbs-down form of an answer, open over the whole panel.
  const [feedback, setFeedback] = useState<{ send: FeedbackSend } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const now = useNow();

  // The panel opens with the cursor in the question field.
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);

  // Only the newest thing is announced to screen readers: Aco's last reply or the error, never the whole conversation.
  const last = turns[turns.length - 1];
  const announcement = error ? ERROR_TEXT[error] : !thinking && last?.from === "assistant" ? `${NAME} respondió: ${last.reply.text}` : "";

  // Keep the latest message in sight, as in any chat. With no conversation yet, stay on top: the welcome is there.
  useEffect(() => {
    if (!turns.length && !thinking && !error) return;
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [turns.length, thinking, error]);

  const handlers: BlockHandlers = {
    // The position is matched against the department map in the browser; only the municipality name is sent.
    // Denied, unavailable or outside Mendoza: the list opens, so nobody is left without a way forward.
    onLocate: async () => {
      const coords = await currentPosition();
      const municipality = coords ? await municipalityAt(coords.latitude, coords.longitude).catch(() => null) : null;
      if (municipality) onSend(municipality);
      else setSheet({ kind: "municipality" });
    },
    onPickMunicipality: () => setSheet({ kind: "municipality" }),
    onSearchActivity: (items) => setSheet({ kind: "activity", items }),
    onChoose: onSend,
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background-full">
      <Header onClose={onClose} onRestart={turns.length && !thinking ? onRestart : undefined} />
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-5">
        {turns.length === 0 && (
          <>
            <Hero />
            <BotText>Te digo qué hacer, cuánto cuesta y de dónde sale cada dato. Confirmalo siempre en la ventanilla.</BotText>
            <Suggestions onAsk={onSend} />
          </>
        )}
        {turns.map((turn, i) => {
          const key = `${i}-${turn.from}`;
          if (turn.from === "user") return <UserBubble key={key}>{turn.text}</UserBubble>;
          const { reply } = turn;
          const answered = i < turns.length - 1;
          return (
            <BotTurn key={key}>
              {reply.outcome === "unpublished" ? <ShyText>{reply.text}</ShyText> : <BotText>{reply.text}</BotText>}
              {reply.blocks.map((block, j) => (
                <BlockView key={`${block.type}-${j}`} block={block} answered={answered} handlers={handlers} />
              ))}
              {RATED.has(reply.outcome) && <AnswerFooter reply={reply} at={turn.at} now={now} onAskWhy={(send) => setFeedback({ send })} />}
            </BotTurn>
          );
        })}
        {error && <ErrorTurn error={error} onRetry={onRetry} />}
      </div>
      {thinking && <ProgressLine progress={progress} />}
      <form
        className="flex shrink-0 items-center gap-2 px-4 pt-3 pb-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim() || thinking) return;
          onSend(draft);
          setDraft("");
        }}
      >
        <input
          ref={input}
          aria-label="Tu pregunta"
          placeholder="Escribí tu pregunta"
          enterKeyHint="send"
          maxLength={500}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-12 min-w-0 flex-1 rounded-2xl bg-background-surface px-4 shadow-card text-body-regular text-text-primary outline-none placeholder:text-text-tertiary focus-visible:ring-2 focus-visible:ring-border-focus-ring max-sm:text-base"
        />
        <IconButton icon={RiSendPlane2Line} aria-label="Enviar" type="submit" disabled={thinking} className="size-12" />
      </form>
      {verification && <div className="flex shrink-0 justify-center px-4 pt-3 empty:hidden">{verification}</div>}
      {feedback && (
        <FeedbackSheet
          onClose={() => setFeedback(null)}
          onSend={(reason, note) => {
            feedback.send(reason, note);
            setFeedback(null);
          }}
        />
      )}
      {sheet && (
        <SearchSheet
          {...(sheet.kind === "municipality"
            ? {
                title: "¿En qué municipio?",
                searchLabel: "Buscar municipio",
                empty: "Ningún municipio se llama así. Probá con otra parte del nombre.",
                items: MUNICIPALITIES.map((label) => ({ label })),
              }
            : {
                title: "¿Qué vas a vender?",
                searchLabel: "Buscar rubro",
                empty: "Ese rubro todavía no está en la lista de este municipio.",
                items: sheet.items.map((item) => ({ ...item, icon: activityIcon(item.id, item.label) })),
                askFree: (query: string) => `Preguntar por «${query}»`,
              })}
          onPick={(label) => {
            setSheet(null);
            onSend(label);
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
