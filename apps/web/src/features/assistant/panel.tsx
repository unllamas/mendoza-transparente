import { Button } from "@mt/ui/components/base/buttons/button";
import { IconButton } from "@mt/ui/components/base/buttons/icon-button";
import { RiArrowRightSLine, RiCloseLine, RiSendPlane2Line } from "@remixicon/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type BlockHandlers, BlockView } from "./blocks.tsx";
import { AnswerFooter } from "./feedback.tsx";
import { Andes, Mascot } from "./mascot.tsx";
import { MunicipalitySheet } from "./municipality-sheet.tsx";
import type { Turn } from "./use-conversation.ts";

export const NAME = "Aco";

const SUGGESTIONS = ["¿Qué necesito para abrir un comercio?", "¿Cuánto cobra de tasas mi municipio?", "¿Cuánto pago de Ingresos Brutos?"];

/** Answers that get the time and the thumbs; the ones that only ask something do not. */
const RATED = new Set(["steps", "unpublished", "answer"]);

function Header({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-16 shrink-0 items-center gap-3 border-b border-separator-border bg-background-surface pr-2 pl-4">
      <span className="relative shrink-0">
        <Mascot className="size-10" />
        <span className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-background-surface bg-green-500" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body-semibold text-text-primary">{NAME}</span>
        <span className="truncate text-caption-1-regular text-text-secondary">Guía de trámites de Mendoza</span>
      </span>
      <IconButton icon={RiCloseLine} aria-label="Cerrar la guía" onClick={onClose} />
    </div>
  );
}

/** Welcome: the mascot over the Andes with two speech bubbles, like a postcard. */
function Hero() {
  return (
    <div className="relative -mx-5 -mt-5 h-60 shrink-0 overflow-hidden bg-accent-50">
      <Andes />
      <Mascot className="absolute top-4 left-1/2 size-28 -translate-x-1/2" background={false} />
      <p className="absolute top-32 left-8 -rotate-3 rounded-2xl rounded-bl-sm bg-background-surface px-4 py-2 text-body-bold text-text-primary shadow-md">
        ¡Hola! Soy {NAME} 👋
      </p>
      <p className="absolute top-44 right-6 rotate-2 rounded-2xl rounded-br-sm bg-accent-600 px-4 py-2 text-body-bold text-white shadow-md">
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

function Suggestions({ onAsk }: { onAsk: (q: string) => void }) {
  return (
    <div className="flex flex-col items-end gap-2">
      {SUGGESTIONS.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onAsk(q)}
          className="flex min-h-11 max-w-[80%] items-center gap-2 rounded-2xl border border-transparent bg-background-interactive py-2 pr-3 pl-4 text-left text-body-regular text-text-primary shadow-card transition-colors hover:border-border-link active:bg-background-interactive-hover"
        >
          <span className="min-w-0">{q}</span>
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

/** The panel: header with the mascot, conversation, composer pinned at the bottom and the AI notice under it. */
export function Panel({
  turns,
  thinking,
  failed,
  onSend,
  onRetry,
  onClose,
}: {
  turns: Turn[];
  thinking: boolean;
  failed: boolean;
  onSend: (text: string) => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [sheet, setSheet] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const now = useNow();

  // Keep the latest message in sight, as in any chat.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll again whenever the conversation grows
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [turns.length, thinking, failed]);

  const handlers: BlockHandlers = {
    onLocate: () => {
      // TODO: match the coordinates against the municipality boundaries (data/processed/geo) and send the name as the
      // user's message. Until that exists, any outcome opens the list, so nobody is left without a way forward.
      if (!("geolocation" in navigator)) return setSheet(true);
      navigator.geolocation.getCurrentPosition(
        () => setSheet(true),
        () => setSheet(true),
        { timeout: 8000 },
      );
    },
    onPickMunicipality: () => setSheet(true),
    onChoose: onSend,
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background-full">
      <Header onClose={onClose} />
      <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-5">
        <Hero />
        <p className="flex items-center gap-3 text-caption-1-regular text-text-tertiary" aria-hidden>
          <span className="h-px flex-1 bg-separator-border" />
          Hoy
          <span className="h-px flex-1 bg-separator-border" />
        </p>
        <BotText>
          Preguntame por un trámite, un impuesto o una tasa de Mendoza. Te digo qué papeles necesitás, cuánto cuesta y de dónde sale cada
          dato.
        </BotText>
        {turns.length === 0 && <Suggestions onAsk={onSend} />}
        {turns.map((turn, i) => {
          const key = `${i}-${turn.from}`;
          if (turn.from === "user") return <UserBubble key={key}>{turn.text}</UserBubble>;
          const { reply } = turn;
          const answered = i < turns.length - 1;
          return (
            <BotTurn key={key}>
              <BotText>{reply.text}</BotText>
              {reply.blocks.map((block, j) => (
                <BlockView key={`${block.type}-${j}`} block={block} answered={answered} handlers={handlers} />
              ))}
              {RATED.has(reply.outcome) && <AnswerFooter reply={reply} at={turn.at} now={now} />}
            </BotTurn>
          );
        })}
        {thinking && (
          <p className="text-caption-1-regular text-text-tertiary motion-safe:animate-pulse">{NAME} está buscando en las fuentes…</p>
        )}
        {failed && (
          <BotTurn>
            <BotText>No pude responder ahora. Probá de nuevo en un rato.</BotText>
            <Button variant="secondary" onClick={onRetry} className="self-start">
              Reintentar
            </Button>
          </BotTurn>
        )}
      </div>
      <form
        className="flex shrink-0 items-center gap-2 px-4 pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim() || thinking) return;
          onSend(draft);
          setDraft("");
        }}
      >
        <input
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
      <p className="shrink-0 px-5 pt-2 pb-3 text-center text-caption-1-regular text-text-tertiary">
        {NAME} usa IA con datos oficiales y puede equivocarse. Confirmá en la ventanilla.
      </p>
      {sheet && (
        <MunicipalitySheet
          onPick={(municipality) => {
            setSheet(false);
            onSend(municipality);
          }}
          onClose={() => setSheet(false)}
        />
      )}
    </div>
  );
}
