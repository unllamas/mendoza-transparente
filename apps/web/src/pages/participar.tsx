import { tileVariants } from "@mt/ui/components/card";
import { Field, Input, Select, Textarea } from "@mt/ui/components/input";
import { cn } from "@mt/ui/lib/utils";
import { buttonVariants } from "@mt/ui/components/button";
import { Alert } from "@mt/ui/components/alert";
import { PageHeader } from "@mt/ui/components/section";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Bug, CheckCircle2, FilePlus2, MessageSquareReply, Send, Stamp } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";

import { useUrlOption } from "../url-state.ts";
import { track } from "../analytics.ts";
import type { NoPublicado } from "../types.ts";
import { TrackedSegmented } from "../components/tracked-segmented.tsx";

const route = getRouteApi("/participar");

type Form = "pedido" | "respuesta" | "error" | "dato";
const FORMS: { value: Form; label: string }[] = [
  { value: "pedido", label: "Registrar mi pedido" },
  { value: "respuesta", label: "Contar la respuesta" },
  { value: "error", label: "Reportar un error" },
  { value: "dato", label: "Sugerir un dato" },
];

export interface RequestStats {
  items: Record<string, { requests: number; answered: number; denied: number; overdue: number }>;
  total: { requests: number; answered: number; denied: number; overdue: number };
}

/** Public counters of the requests people filed (null while loading or if the API is not available). */
export function useRequestStats(): RequestStats | null {
  const [stats, setStats] = useState<RequestStats | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/pedidos/stats")
      .then((r) => (r.ok && r.headers.get("content-type")?.includes("json") ? (r.json() as Promise<RequestStats>) : null))
      .then((s) => !cancelled && setStats(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return stats;
}

export function ParticiparPage() {
  const items = route.useLoaderData();
  const search = route.useSearch();
  // The open form lives in the URL (?tipo=…), so links from other pages land on the right one.
  const [form, setForm] = useUrlOption<Form>("tipo", ["pedido", "respuesta", "error", "dato"], "pedido");
  const stats = useRequestStats();

  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <PageHeader icon={Stamp} topic="Participá" title="Sumate a Mendoza Transparente">
        Registrá los pedidos de información que presentaste y lo que te respondieron, avisanos si encontrás un error o
        sugerinos datos que falten. Así medimos cuánto se pide y cuánto responde el Estado.
      </PageHeader>

      {stats && stats.total.requests > 0 && (
        <div className="grid grid-cols-3 divide-x divide-line rounded-2xl bg-tile py-3 text-center">
          <Counter value={stats.total.requests} label={stats.total.requests === 1 ? "pedido registrado" : "pedidos registrados"} />
          <Counter value={stats.total.answered} label="con respuesta" />
          <Counter value={stats.total.denied + stats.total.overdue} label="negados o sin respuesta" />
        </div>
      )}

      <TrackedSegmented label="Qué querés hacer" options={FORMS} value={form} onChange={setForm} trackId="participation.form" />

      {form === "pedido" && <RequestForm items={items} defaultItem={search.dato ?? null} />}
      {form === "respuesta" && <AnswerForm />}
      {form === "error" && <FeedbackForm kind="error" defaultPage={search.pagina ?? null} />}
      {form === "dato" && <FeedbackForm kind="dato" defaultPage={null} />}

      <Alert variant="note" title="Qué hacemos con lo que nos mandás">
        Publicamos solo números agregados: cuántos pedidos hay por dato y cuántos tuvieron respuesta. Tu correo es opcional, no
        se publica y solo lo usamos para escribirte sobre tu envío. No pedimos tu DNI.
      </Alert>
    </div>
  );
}

function Counter({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-2">
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-balance text-ink-muted">{label}</span>
    </div>
  );
}

// ------------------------------------------------------------------ forms

type SubmitState = { status: "idle" | "sending" | "done" } | { status: "error"; message: string };

function useSubmit(endpoint: string, trackEvent: string) {
  const [state, setState] = useState<SubmitState>({ status: "idle" });
  async function submit(body: Record<string, unknown>, token: string | null) {
    setState({ status: "sending" });
    try {
      const r = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, token }) });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        track(`${trackEvent}.error`, { status: r.status });
        setState({ status: "error", message: data.error ?? "No pudimos guardar tu envío. Probá de nuevo en un rato." });
        return;
      }
      track(`${trackEvent}.success`);
      setState({ status: "done" });
    } catch {
      track(`${trackEvent}.error`, { status: 0 });
      setState({ status: "error", message: "No hay conexión con el servidor. Probá de nuevo en un rato." });
    }
  }
  return { state, submit, reset: () => setState({ status: "idle" }) };
}

function RequestForm({ items, defaultItem }: { items: NoPublicado[]; defaultItem: string | null }) {
  const { state, submit, reset } = useSubmit("/api/pedidos", "participation.request");
  const [token, setToken] = useState<string | null>(null);
  const [itemId, setItemId] = useState(items.some((i) => i.id === defaultItem) ? defaultItem! : (items[0]?.id ?? "otro"));
  if (state.status === "done")
    return (
      <Done onAgain={reset} again="Registrar otro pedido">
        Registramos tu pedido. Cuando te respondan (o si pasan 15 días hábiles sin respuesta), contanos qué pasó con el mismo
        número de trámite.
      </Done>
    );
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void submit(
      {
        itemId,
        agency: f.get("agency"),
        filedOn: f.get("filedOn"),
        filingNumber: f.get("filingNumber"),
        detail: f.get("detail"),
        email: f.get("email"),
        website: f.get("website"),
      },
      token,
    );
  };
  const item = items.find((i) => i.id === itemId);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" id="form-pedido" data-track-form="request">
      <Intro icon={FilePlus2}>
        ¿Presentaste un pedido de acceso a la información? Registralo con el número de trámite que te dio el formulario oficial.
        No publicamos tu número: lo usamos para contar los pedidos y para que después puedas contarnos la respuesta.
      </Intro>
      <Field label="Qué dato pediste">
        <Select value={itemId} onChange={(e) => setItemId(e.target.value)} id="pedido-dato">
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.titulo}
            </option>
          ))}
          <option value="otro">Otro dato</option>
        </Select>
      </Field>
      <Field label="A qué organismo" hint={item ? `Sugerido: ${item.organismo}` : undefined}>
        <Input name="agency" defaultValue={item?.organismo ?? ""} key={itemId} maxLength={200} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Fecha en que lo presentaste">
          <Input name="filedOn" type="date" required max={new Date().toISOString().slice(0, 10)} />
        </Field>
        <Field label="Número de trámite">
          <Input name="filingNumber" required placeholder="EX-2026-…" maxLength={60} autoComplete="off" />
        </Field>
      </div>
      {itemId === "otro" && (
        <Field label="Qué pediste">
          <Textarea name="detail" required rows={3} maxLength={1000} />
        </Field>
      )}
      <EmailField />
      <Honeypot />
      <Turnstile onToken={setToken} />
      <SubmitRow state={state} label="Registrar pedido" id="pedido-registrar" />
    </form>
  );
}

function AnswerForm() {
  const { state, submit, reset } = useSubmit("/api/pedidos/respuesta", "participation.answer");
  const [token, setToken] = useState<string | null>(null);
  if (state.status === "done")
    return (
      <Done onAgain={reset} again="Contar otra respuesta">
        Gracias. Con tu respuesta sabemos cuánto cumple el Estado con la Ley 9070.
      </Done>
    );
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void submit(
      { filingNumber: f.get("filingNumber"), status: f.get("status"), answeredOn: f.get("answeredOn"), summary: f.get("summary"), url: f.get("url"), website: f.get("website") },
      token,
    );
  };
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" id="form-respuesta">
      <Intro icon={MessageSquareReply}>Contanos qué pasó con un pedido que registraste antes, con el mismo número de trámite.</Intro>
      <Field label="Número de trámite">
        <Input name="filingNumber" required maxLength={60} autoComplete="off" />
      </Field>
      <Field label="Qué pasó">
        <Select name="status" required defaultValue="respondido">
          <option value="respondido">Me respondieron con lo que pedí</option>
          <option value="parcial">Me respondieron en parte</option>
          <option value="denegado">Me lo negaron</option>
          <option value="sin_respuesta">Pasó el plazo y no me respondieron</option>
        </Select>
      </Field>
      <Field label="Fecha de la respuesta (si hubo)">
        <Input name="answeredOn" type="date" max={new Date().toISOString().slice(0, 10)} />
      </Field>
      <Field label="Qué te respondieron, en pocas palabras (opcional)">
        <Textarea name="summary" rows={3} maxLength={2000} />
      </Field>
      <Field label="Link a la respuesta, si la subiste a algún lado (opcional)">
        <Input name="url" type="url" maxLength={500} placeholder="https://" />
      </Field>
      <Honeypot />
      <Turnstile onToken={setToken} />
      <SubmitRow state={state} label="Enviar respuesta" id="respuesta-enviar" />
    </form>
  );
}

function FeedbackForm({ kind, defaultPage }: { kind: "error" | "dato"; defaultPage: string | null }) {
  const { state, submit, reset } = useSubmit("/api/feedback", `participation.${kind === "error" ? "bug" : "data_suggestion"}`);
  const [token, setToken] = useState<string | null>(null);
  if (state.status === "done")
    return (
      <Done onAgain={reset} again="Enviar otro">
        {kind === "error" ? "Gracias por avisarnos. Lo revisamos y lo corregimos." : "Gracias. Lo sumamos a la lista de datos para buscar."}
      </Done>
    );
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void submit({ kind, message: f.get("message"), page: f.get("page"), email: f.get("email"), website: f.get("website") }, token);
  };
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" id={kind === "error" ? "form-error" : "form-dato"}>
      <Intro icon={kind === "error" ? Bug : Send}>
        {kind === "error"
          ? "¿Un número que no cierra, un link roto o algo que se ve mal? Contanos dónde y qué pasó."
          : "¿Qué dato público de Mendoza te gustaría encontrar acá? Si sabés dónde está publicado, dejanos el link."}
      </Intro>
      {kind === "error" && (
        <Field label="En qué página">
          <Input name="page" defaultValue={defaultPage ?? ""} placeholder="/deuda" maxLength={300} />
        </Field>
      )}
      <Field label={kind === "error" ? "Qué encontraste" : "Qué dato y por qué te interesa"}>
        <Textarea name="message" required minLength={10} rows={5} maxLength={2000} />
      </Field>
      <EmailField />
      <Honeypot />
      <Turnstile onToken={setToken} />
      <SubmitRow state={state} label="Enviar" id={kind === "error" ? "error-enviar" : "dato-enviar"} />
    </form>
  );
}

// ------------------------------------------------------------------ pieces

function Intro({ icon: Icon, children }: { icon: typeof Bug; children: ReactNode }) {
  return (
    <p className="flex items-start gap-3 text-ink-2 text-pretty">
      <Icon className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function EmailField() {
  return (
    <Field label="Tu correo (opcional)" hint="Solo para escribirte sobre este envío. No se publica.">
      <Input name="email" type="email" maxLength={200} autoComplete="email" />
    </Field>
  );
}

/** Hidden field that only bots fill. */
function Honeypot() {
  return (
    <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
  );
}

function SubmitRow({ state, label, id }: { state: SubmitState; label: string; id: string }) {
  return (
    <div className="flex flex-col gap-3">
      {state.status === "error" && <Alert title="No se pudo enviar">{state.message}</Alert>}
      <button
        type="submit"
        id={id}
        data-track={`${id}.click`}
        disabled={state.status === "sending"}
        className={cn(buttonVariants({ variant: "primary" }), "w-fit")}
      >
        <Send className="size-4" aria-hidden /> {state.status === "sending" ? "Enviando…" : label}
      </button>
    </div>
  );
}

function Done({ children, onAgain, again }: { children: ReactNode; onAgain: () => void; again: string }) {
  return (
    <div className={cn(tileVariants({ size: "lg" }), "flex flex-col gap-4")}>
      <p className="flex items-start gap-3 text-ink">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-good" aria-hidden />
        <span className="text-pretty">{children}</span>
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <button type="button" onClick={onAgain} className="text-link hover:underline">
          {again}
        </button>
        <Link to="/no-publicado" className="text-link hover:underline">
          Ver lo que el Estado no publica ›
        </Link>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Turnstile (anti-spam)

const TURNSTILE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
let turnstileScript: Promise<void> | null = null;

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; remove: (id: string) => void };
  }
}

/** Cloudflare Turnstile widget. Without VITE_TURNSTILE_SITE_KEY (development) it renders nothing. */
function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
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
