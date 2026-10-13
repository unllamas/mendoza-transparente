import { Alert } from "@mt/ui/components/alert";
import { Button, buttonClassName } from "@mt/ui/components/base/buttons/button";
import { Input, InputBase, TextField } from "@mt/ui/components/base/input/input";
import { Label } from "@mt/ui/components/base/input/label";
import { Select, SelectItem } from "@mt/ui/components/base/select/select";
import { Textarea } from "@mt/ui/components/base/textarea/textarea";
import { tileVariants } from "@mt/ui/components/card";
import { PageHeader } from "@mt/ui/components/section";
import { cx } from "@mt/ui/lib/cx";
import {
  type RemixiconComponentType,
  RiBugLine,
  RiCheckboxCircleLine,
  RiContractLine,
  RiFileAddLine,
  RiReplyLine,
  RiSendPlaneLine,
} from "@remixicon/react";
import { getRouteApi, Link } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { track } from "@/analytics.ts";
import { TrackedSegmented } from "@/components/tracked-segmented.tsx";
import { useRequestStats } from "@/features/participation/api/request-stats.ts";
import type { NoPublicado } from "@/types.ts";
import { useUrlOption } from "@/url-state.ts";

const route = getRouteApi("/participar");

type Form = "pedido" | "respuesta" | "error" | "dato";
const FORMS: { value: Form; label: string }[] = [
  { value: "pedido", label: "Registrar mi pedido" },
  { value: "respuesta", label: "Contar la respuesta" },
  { value: "error", label: "Reportar un error" },
  { value: "dato", label: "Sugerir un dato" },
];

export function ParticiparPage() {
  const items = route.useLoaderData();
  const search = route.useSearch();
  // The open form lives in the URL (?tipo=…), so links from other pages land on the right one.
  const [form, setForm] = useUrlOption<Form>("tipo", ["pedido", "respuesta", "error", "dato"], "pedido");
  const stats = useRequestStats();

  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <PageHeader icon={RiContractLine} topic="Participá" title="Sumate a Mendoza Transparente">
        Registrá los pedidos de información que presentaste y lo que te respondieron, avisanos si encontrás un error o sugerinos datos que
        falten. Así medimos cuánto se pide y cuánto responde el Estado.
      </PageHeader>

      {stats && stats.total.requests > 0 && (
        <div className={cx(tileVariants({ size: "sm" }), "grid grid-cols-3 divide-x divide-separator-border text-center")}>
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
        Publicamos solo números agregados: cuántos pedidos hay por dato y cuántos tuvieron respuesta. Tu correo es opcional, no se publica y
        solo lo usamos para escribirte sobre tu envío. No pedimos tu DNI.
      </Alert>
    </div>
  );
}

function Counter({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-2">
      <span className="text-title-1-semibold tabular-nums">{value}</span>
      <span className="text-caption-1-regular text-balance text-text-tertiary">{label}</span>
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
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, token }),
      });
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
        Registramos tu pedido. Cuando te respondan (o si pasan 15 días hábiles sin respuesta), contanos qué pasó con el mismo número de
        trámite.
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
      <Intro icon={RiFileAddLine}>
        ¿Presentaste un pedido de acceso a la información? Registralo con el número de trámite que te dio el formulario oficial. No
        publicamos tu número: lo usamos para contar los pedidos y para que después puedas contarnos la respuesta.
      </Intro>
      <Select label="Qué dato pediste" value={itemId} onChange={(key) => setItemId(String(key))} id="pedido-dato">
        {items.map((i) => (
          <SelectItem key={i.id} id={i.id}>
            {i.titulo}
          </SelectItem>
        ))}
        <SelectItem id="otro">Otro dato</SelectItem>
      </Select>
      <Input
        label="A qué organismo"
        hint={item ? `Sugerido: ${item.organismo}` : undefined}
        name="agency"
        defaultValue={item?.organismo ?? ""}
        key={itemId}
        maxLength={200}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <DateInput label="Fecha en que lo presentaste" name="filedOn" isRequired max={new Date().toISOString().slice(0, 10)} />
        <Input label="Número de trámite" name="filingNumber" isRequired placeholder="EX-2026-…" maxLength={60} autoComplete="off" />
      </div>
      {itemId === "otro" && <Textarea label="Qué pediste" name="detail" isRequired rows={3} maxLength={1000} />}
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
      {
        filingNumber: f.get("filingNumber"),
        status: f.get("status"),
        answeredOn: f.get("answeredOn"),
        summary: f.get("summary"),
        url: f.get("url"),
        website: f.get("website"),
      },
      token,
    );
  };
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" id="form-respuesta">
      <Intro icon={RiReplyLine}>Contanos qué pasó con un pedido que registraste antes, con el mismo número de trámite.</Intro>
      <Input label="Número de trámite" name="filingNumber" isRequired maxLength={60} autoComplete="off" />
      <Select label="Qué pasó" name="status" isRequired defaultValue="respondido">
        <SelectItem id="respondido">Me respondieron con lo que pedí</SelectItem>
        <SelectItem id="parcial">Me respondieron en parte</SelectItem>
        <SelectItem id="denegado">Me lo negaron</SelectItem>
        <SelectItem id="sin_respuesta">Pasó el plazo y no me respondieron</SelectItem>
      </Select>
      <DateInput label="Fecha de la respuesta (si hubo)" name="answeredOn" max={new Date().toISOString().slice(0, 10)} />
      <Textarea label="Qué te respondieron, en pocas palabras (opcional)" name="summary" rows={3} maxLength={2000} />
      <Input
        label="Link a la respuesta, si la subiste a algún lado (opcional)"
        name="url"
        type="url"
        maxLength={500}
        placeholder="https://"
      />
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
      <Intro icon={kind === "error" ? RiBugLine : RiSendPlaneLine}>
        {kind === "error"
          ? "¿Un número que no cierra, un link roto o algo que se ve mal? Contanos dónde y qué pasó."
          : "¿Qué dato público de Mendoza te gustaría encontrar acá? Si sabés dónde está publicado, dejanos el link."}
      </Intro>
      {kind === "error" && (
        <Input label="En qué página" name="page" defaultValue={defaultPage ?? ""} placeholder="/deuda" maxLength={300} />
      )}
      <Textarea
        label={kind === "error" ? "Qué encontraste" : "Qué dato y por qué te interesa"}
        name="message"
        isRequired
        minLength={10}
        rows={5}
        maxLength={2000}
      />
      <EmailField />
      <Honeypot />
      <Turnstile onToken={setToken} />
      <SubmitRow state={state} label="Enviar" id={kind === "error" ? "error-enviar" : "dato-enviar"} />
    </form>
  );
}

// ------------------------------------------------------------------ pieces

/** Date field with the phone's own date picker (React Aria's TextField only types text-like inputs). */
function DateInput({ label, name, isRequired, max }: { label: string; name: string; isRequired?: boolean; max?: string }) {
  return (
    <TextField name={name} isRequired={isRequired} className="flex flex-col gap-1.5">
      <Label isRequired={isRequired}>{label}</Label>
      <InputBase type="date" max={max} />
    </TextField>
  );
}

function Intro({ icon: Icon, children }: { icon: RemixiconComponentType; children: ReactNode }) {
  return (
    <p className="flex items-start gap-3 text-text-secondary text-pretty">
      <Icon className="mt-0.5 size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function EmailField() {
  return (
    <Input
      label="Tu correo (opcional)"
      hint="Solo para escribirte sobre este envío. No se publica."
      name="email"
      type="email"
      maxLength={200}
      autoComplete="email"
    />
  );
}

/** Hidden field that only bots fill. */
function Honeypot() {
  return <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />;
}

function SubmitRow({ state, label, id }: { state: SubmitState; label: string; id: string }) {
  return (
    <div className="flex flex-col gap-3">
      {state.status === "error" && <Alert title="No se pudo enviar">{state.message}</Alert>}
      <Button
        type="submit"
        id={id}
        data-track={`${id}.click`}
        disabled={state.status === "sending"}
        leadingIcon={RiSendPlaneLine}
        className="w-fit"
      >
        {state.status === "sending" ? "Enviando…" : label}
      </Button>
    </div>
  );
}

function Done({ children, onAgain, again }: { children: ReactNode; onAgain: () => void; again: string }) {
  return (
    <div className={cx(tileVariants({ size: "lg" }), "flex flex-col gap-4")}>
      <p className="flex items-start gap-3 text-text-primary">
        <RiCheckboxCircleLine className="mt-0.5 size-5 shrink-0 text-good" aria-hidden />
        <span className="text-pretty">{children}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onAgain}>
          {again}
        </Button>
        <Link to="/no-publicado" className={buttonClassName({ variant: "tertiary" })}>
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
