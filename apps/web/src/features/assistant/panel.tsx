import type { Block, Progress } from "@mt/assistant/types";
import { MUNICIPALITIES } from "@mt/assistant/types";
import { Mascot, MascotAvatar } from "@mt/mascots/mascot";
import { Button } from "@mt/ui/components/base/buttons/button";
import { IconButton } from "@mt/ui/components/base/buttons/icon-button";
import { RiArrowRightSLine, RiArrowRightUpLine, RiCloseLine, RiRestartLine, RiSendPlane2Line } from "@remixicon/react";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { activityIcon } from "./activity-icons.ts";
import { Andes } from "./andes.tsx";
import { type BlockHandlers, BlockView } from "./blocks.tsx";
import { AnswerFooter, type FeedbackSend, FeedbackSheet } from "./feedback.tsx";
import { currentPosition, municipalityAt } from "./locate.ts";
import { allowedHrefs, type Inline, type Paragraph, parseReplyText, plainReplyText } from "./reply-text.ts";
import { type SearchItem, SearchSheet } from "./search-sheet.tsx";
import { type ConversationError, progressText, type Turn, toMessages } from "./use-conversation.ts";

export const NAME = "Aco";

/**
 * Lo bastante cortas para una línea a 320 px, y solo lo que Aco puede responder con lo que tenemos: una sugerencia que
 * después no puede resolver es peor que ninguna (Ingresos Brutos todavía no está en el conocimiento). Una por tipo: un
 * trámite, una tasa, los datos del sitio.
 */
const SUGGESTIONS = ["¿Cómo abro un comercio?", "¿Cuánto cobra mi municipio?", "¿Quién le vende al Estado?"];

/** Respuestas que llevan la hora y los pulgares; las que solo preguntan algo, no. */
const RATED = new Set(["steps", "fee", "data", "unpublished", "answer"]);

function Header({ onClose, onRestart }: { onClose: () => void; onRestart?: () => void }) {
  return (
    <div className="flex h-16 shrink-0 items-center gap-3 border-b border-separator-border bg-background-surface pr-2 pl-4">
      <span className="relative shrink-0">
        <MascotAvatar mascot="aco" size={40} decorative />
        <span className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-background-surface bg-green-500" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body-semibold text-text-primary">{NAME}</span>
        {/* El aviso de IA vive acá: siempre a la vista, sin ocupar una línea debajo del campo de texto. */}
        <span className="truncate text-caption-1-regular text-text-secondary">Responde con IA y datos oficiales</span>
      </span>
      {onRestart && <IconButton icon={RiRestartLine} aria-label="Empezar de nuevo" onClick={onRestart} />}
      <IconButton icon={RiCloseLine} aria-label="Cerrar la guía" onClick={onClose} />
    </div>
  );
}

/**
 * Bienvenida: la mascota sobre los Andes con dos globos de diálogo, como una postal. Solo antes de la primera pregunta:
 * después el encabezado ya muestra a Aco, y el espacio es para la conversación.
 */
function Hero() {
  return (
    <div className="relative -mx-5 -mt-5 h-44 shrink-0 overflow-hidden bg-accent-50">
      <Andes />
      {/* Scaled from the bottom and pushed down, so only the head and the waving wing show over the mountains. */}
      <Mascot
        mascot="aco"
        pose="wave"
        size={120}
        priority
        className="absolute bottom-0 left-1/2 origin-bottom -translate-x-1/2 translate-y-[42%] scale-[1.9]"
      />
      <p className="absolute bottom-14 left-5 -rotate-3 rounded-2xl rounded-bl-sm bg-background-surface px-3 py-1.5 text-body-bold text-text-primary shadow-md">
        ¡Hola! Soy {NAME} 👋
      </p>
      <p className="absolute right-5 bottom-5 rotate-2 rounded-2xl rounded-br-sm bg-accent-600 px-3 py-1.5 text-body-bold text-white shadow-md">
        Trámites y datos del Estado
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

/** Columna del agente: sin globo, 85% del ancho, para que sus turnos y los del usuario se lean como dos lados. */
function BotTurn({ children }: { children: ReactNode }) {
  return <div className="flex w-[85%] max-w-[85%] flex-col gap-4 self-start">{children}</div>;
}

function BotText({ children }: { children: ReactNode }) {
  return <p className="text-body-regular text-pretty text-text-primary">{children}</p>;
}

function InlineView({ inline, onNavigate }: { inline: Inline; onNavigate: () => void }) {
  switch (inline.type) {
    case "text":
      return inline.value;
    case "strong":
      return <strong className="font-semibold">{inline.value}</strong>;
    case "em":
      return <em>{inline.value}</em>;
    case "link":
      // Un link del sitio navega sin recargar: el widget vive en el layout y la conversación sigue ahí.
      return inline.internal ? (
        <Link to={inline.href} onClick={onNavigate} className="font-medium text-text-link hover:underline">
          {inline.label}
        </Link>
      ) : (
        <a href={inline.href} target="_blank" rel="noreferrer" className="font-medium text-text-link hover:underline">
          {inline.label}
          <RiArrowRightUpLine className="ml-0.5 inline size-4 align-[-2px]" aria-hidden />
        </a>
      );
  }
}

/** Las líneas de una lista seguidas van juntas en un mismo `ul`; el resto, un párrafo cada una. */
function groupParagraphs(paragraphs: Paragraph[]): (Paragraph | Paragraph[])[] {
  const groups: (Paragraph | Paragraph[])[] = [];
  for (const p of paragraphs) {
    const prev = groups[groups.length - 1];
    if (p.kind === "li" && Array.isArray(prev)) prev.push(p);
    else groups.push(p.kind === "li" ? [p] : p);
  }
  return groups;
}

/**
 * El texto de una respuesta con su markdown resuelto: negrita, cursiva, listas y links. Solo se abren los links que
 * trajeron las herramientas en los bloques de esa misma respuesta (`allowedHrefs`).
 */
function ReplyText({ text, blocks, onNavigate }: { text: string; blocks: Block[]; onNavigate: () => void }) {
  const groups = useMemo(() => groupParagraphs(parseReplyText(text, allowedHrefs(blocks))), [text, blocks]);
  const inlines = (p: Paragraph) => p.inlines.map((inline, i) => <InlineView key={i} inline={inline} onNavigate={onNavigate} />);
  return (
    <div className="flex flex-col gap-2 text-body-regular text-pretty text-text-primary">
      {groups.map((group, i) =>
        Array.isArray(group) ? (
          <ul key={i} className="flex list-disc flex-col gap-1 pl-5 marker:text-text-tertiary">
            {group.map((p, j) => (
              <li key={j}>{inlines(p)}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{inlines(group)}</p>
        ),
      )}
    </div>
  );
}

/** Texto con una pequeña Aco tímida al lado: para errores y para datos que no se publican. */
function ShyText({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-end gap-2">
      <Mascot mascot="aco" pose="shy" size={48} decorative className="shrink-0" />
      {typeof children === "string" ? <BotText>{children}</BotText> : children}
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

/** Se vuelve a renderizar cada 30 segundos para que "hace 2 min" se mantenga al día. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Lo que Aco está haciendo, justo arriba del campo de texto: un punto que pulsa y unas pocas palabras, nunca la mascota. */
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

/** El error con su botón de reintento. Tras un límite de uso (10 pedidos cada 10 s por IP) el botón espera 10 s. */
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

/** El panel: encabezado con la mascota, conversación y el campo de texto fijo abajo con el progreso de Aco encima. */
export function Panel({
  turns,
  thinking,
  progress,
  error,
  onSend,
  onRetry,
  onRestart,
  onClose,
  onNavigate,
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
  /** Se abrió desde una respuesta un enlace a una página del sitio. */
  onNavigate?: () => void;
  /** El widget de Turnstile, mientras la conversación todavía tiene que demostrar que es una persona. */
  verification?: ReactNode;
}) {
  const [draft, setDraft] = useState("");
  // El selector abierto, si hay alguno: los 18 municipios o las actividades de la última pregunta.
  const [sheet, setSheet] = useState<null | { kind: "municipality" } | { kind: "activity"; items: (SearchItem & { id?: string })[] }>(null);
  // El formulario del pulgar abajo de una respuesta, abierto sobre todo el panel.
  const [feedback, setFeedback] = useState<{ send: FeedbackSend } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const now = useNow();

  // El panel se abre con el cursor en el campo de la pregunta.
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);

  // Solo lo más nuevo se anuncia a los lectores de pantalla: la última respuesta de Aco o el error, nunca todo.
  const last = turns[turns.length - 1];
  const announcement = error
    ? ERROR_TEXT[error]
    : !thinking && last?.from === "assistant"
      ? `${NAME} respondió: ${plainReplyText(last.reply.text)}`
      : "";

  // Mantener el último mensaje a la vista, como en cualquier chat. Sin conversación, quedarse arriba: ahí está la bienvenida.
  useEffect(() => {
    if (!turns.length && !thinking && !error) return;
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [turns.length, thinking, error]);

  const handlers: BlockHandlers = {
    // La posición se compara con el mapa de departamentos en el navegador; solo se manda el nombre del municipio.
    // Denegada, no disponible o fuera de Mendoza: se abre la lista, para que nadie se quede sin camino.
    onLocate: async () => {
      const coords = await currentPosition();
      const municipality = coords ? await municipalityAt(coords.latitude, coords.longitude).catch(() => null) : null;
      if (municipality) onSend(municipality);
      else setSheet({ kind: "municipality" });
    },
    onPickMunicipality: () => setSheet({ kind: "municipality" }),
    onSearchActivity: (items) => setSheet({ kind: "activity", items }),
    onChoose: onSend,
    onNavigate: () => onNavigate?.(),
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
            <p className="text-caption-1-regular text-pretty text-text-tertiary">
              No escribas datos personales: si votás una respuesta, guardamos la conversación para mejorar a {NAME}.
            </p>
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
              {reply.outcome === "unpublished" ? (
                <ShyText>
                  <ReplyText text={reply.text} blocks={reply.blocks} onNavigate={handlers.onNavigate} />
                </ShyText>
              ) : (
                <ReplyText text={reply.text} blocks={reply.blocks} onNavigate={handlers.onNavigate} />
              )}
              {reply.blocks.map((block, j) => (
                <BlockView key={`${block.type}-${j}`} block={block} answered={answered} handlers={handlers} />
              ))}
              {RATED.has(reply.outcome) && (
                <AnswerFooter
                  reply={reply}
                  conversation={() => toMessages(turns.slice(0, i + 1))}
                  at={turn.at}
                  now={now}
                  onAskWhy={(send) => setFeedback({ send })}
                />
              )}
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
