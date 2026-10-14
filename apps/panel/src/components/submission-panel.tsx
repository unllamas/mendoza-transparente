import titles from "virtual:item-titles";
import { Alert } from "@mt/ui/components/alert";
import { Chip } from "@mt/ui/components/base/badges/chip";
import { Button } from "@mt/ui/components/base/buttons/button";
import { Checkbox } from "@mt/ui/components/base/checkbox/checkbox";
import { Input, InputBase, TextField } from "@mt/ui/components/base/input/input";
import { Label } from "@mt/ui/components/base/input/label";
import { Select, SelectItem } from "@mt/ui/components/base/select/select";
import { Switch } from "@mt/ui/components/base/switch/switch";
import { Textarea } from "@mt/ui/components/base/textarea/textarea";
import { tileVariants } from "@mt/ui/components/card";
import { Segmented } from "@mt/ui/components/segmented";
import { cx } from "@mt/ui/lib/cx";
import { RiCheckLine, RiCloseLine, RiExternalLinkLine, RiEyeLine, RiLockLine } from "@remixicon/react";
import { type ReactNode, useState } from "react";
import { ApiError, api, type ReviewStatus, type SubmissionDetail, useApi } from "../api.ts";
import { formatDate, PRIVACY_LABELS, REQUEST_LABELS, REVIEW_LABELS, TYPE_LABELS } from "../labels.ts";

const PUBLIC_SITE = "https://mendoza-transparente.com";

/** One submission: what arrived (private), what gets published, and the team's tools. */
export function SubmissionPanel({ code, onChange }: { code: string; onChange: () => void }) {
  const { data: item, error, setData } = useApi<SubmissionDetail>(`/api/panel/items/${code}`);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);

  async function send(path: string, method: string, body: unknown): Promise<SubmissionDetail | ApiError> {
    setMessage(null);
    try {
      const next = await api<SubmissionDetail>(path, { method, body });
      setData(next);
      onChange();
      return next;
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError("No se pudo guardar.", 0);
      if (!err.warnings.length) setMessage({ kind: "error", text: err.message });
      return err;
    }
  }
  const patch = (body: Record<string, unknown>) => send(`/api/panel/items/${code}`, "PATCH", body);

  if (error)
    return (
      <div className="p-4">
        <Alert title="No se pudo abrir el envío">{error}</Alert>
      </div>
    );
  if (!item) return <p className="p-6 text-body-regular text-text-tertiary">Cargando…</p>;

  return (
    <div className="flex flex-col gap-8 p-4 lg:p-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-body-medium">{item.code}</span>
          <Chip variant="caption" color="soft">
            {TYPE_LABELS[item.type]}
          </Chip>
          {item.isPublic && (
            <Chip variant="caption" color="brand">
              <RiEyeLine aria-hidden /> Publicado
            </Chip>
          )}
          {item.anonymizedAt && (
            <Chip variant="caption" color="neutral">
              Anonimizado el {formatDate(item.anonymizedAt)}
            </Chip>
          )}
        </div>
        <Segmented
          label="Estado de revisión"
          options={(Object.keys(REVIEW_LABELS) as ReviewStatus[]).map((s) => ({ value: s, label: REVIEW_LABELS[s] }))}
          value={item.reviewStatus}
          onChange={(v) => void patch({ reviewStatus: v })}
        />
        {item.reviewedBy && (
          <p className="text-caption-1-regular text-text-tertiary">
            Último cambio: {item.reviewedBy}, {item.reviewedAt && formatDate(item.reviewedAt)}
          </p>
        )}
        {message && (
          <Alert title={message.kind === "error" ? "No se guardó" : "Listo"} variant={message.kind === "ok" ? "note" : undefined}>
            {message.text}
          </Alert>
        )}
      </header>

      <Received item={item} />
      {item.request && <RequestTools item={item} patch={patch} />}
      {item.answers.some((a) => a.reviewStatus === "pending") && (
        <PendingAnswers item={item} review={(id, action) => send(`/api/panel/answers/${id}`, "POST", { action })} />
      )}
      <Publication item={item} patch={patch} />
      <Notes item={item} add={(body) => send(`/api/panel/items/${code}/notes`, "POST", { body })} />
      <History item={item} />
      {!item.anonymizedAt && <Anonymize item={item} run={(confirm) => send(`/api/panel/items/${code}/anonymize`, "POST", { confirm })} />}
    </div>
  );
}

function Block({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-headline-semibold">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-caption-1-regular text-text-tertiary">{label}</dt>
      <dd className="text-body-regular break-words text-text-primary">{children ?? "—"}</dd>
    </div>
  );
}

/** A link someone sent: shown as text, opened only on purpose, without telling the site where it came from. */
function ExternalLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener nofollow"
      className="inline-flex items-center gap-1 break-all text-text-link hover:underline"
    >
      {href} <RiExternalLinkLine className="size-3.5 shrink-0" aria-hidden />
    </a>
  );
}

function Received({ item }: { item: SubmissionDetail }) {
  const r = item.request;
  const f = item.feedback;
  return (
    <Block title="Lo que llegó" icon={<RiLockLine className="size-4 text-foreground-icon-secondary" aria-label="Privado" />}>
      <p className="text-caption-1-regular text-text-tertiary">Privado: nada de esto se publica tal cual.</p>
      <dl className={cx(tileVariants({ size: "sm" }), "grid gap-4 sm:grid-cols-2")}>
        <Field label="Llegó">{formatDate(item.createdAt)}</Field>
        <Field label="Correo">{item.email}</Field>
        {r && (
          <>
            <Field label="Dato pedido">{r.itemId === "otro" ? "Otro dato" : (titles[r.itemId] ?? r.itemId)}</Field>
            <Field label="Organismo (como lo escribió)">{r.agency}</Field>
            <Field label="Presentado">{formatDate(r.filedOn)}</Field>
            <Field label="Número de trámite">
              <span className="font-mono">{r.filingNumber}</span>
            </Field>
            <Field label="Estado del pedido">
              {REQUEST_LABELS[r.status]}
              {r.overdue && " · vencido"}
            </Field>
            <Field label="Clave">{r.hasEditKey ? "Tiene clave" : "Sin clave (registrado antes)"}</Field>
            {r.detail && (
              <div className="sm:col-span-2">
                <Field label="Qué pidió">
                  <span className="whitespace-pre-line">{r.detail}</span>
                </Field>
              </div>
            )}
            {r.answerSummary && (
              <div className="sm:col-span-2">
                <Field label="Qué le respondieron (según la persona)">
                  <span className="whitespace-pre-line">{r.answerSummary}</span>
                </Field>
              </div>
            )}
            {r.answerUrl && (
              <div className="sm:col-span-2">
                <Field label="Link a la respuesta">
                  <ExternalLink href={r.answerUrl} />
                </Field>
              </div>
            )}
          </>
        )}
        {f && (
          <>
            <Field label="Página">{f.page}</Field>
            <div className="sm:col-span-2">
              <Field label="Mensaje">
                <span className="whitespace-pre-line">{f.message}</span>
              </Field>
            </div>
          </>
        )}
      </dl>
    </Block>
  );
}

function RequestTools({ item, patch }: { item: SubmissionDetail; patch: (b: Record<string, unknown>) => Promise<unknown> }) {
  const r = item.request!;
  const [agency, setAgency] = useState(r.agencyNormalized ?? "");
  const [answeredOn, setAnsweredOn] = useState(r.answeredOn ?? "");
  return (
    <Block title="Pedido">
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Estado del pedido" value={r.status} onChange={(v) => void patch({ requestStatus: String(v) })}>
          {Object.entries(REQUEST_LABELS).map(([id, label]) => (
            <SelectItem key={id} id={id}>
              {label}
            </SelectItem>
          ))}
        </Select>
        <TextField
          className="flex flex-col gap-1.5"
          value={answeredOn}
          onChange={setAnsweredOn}
          onBlur={() => void patch({ answeredOn: answeredOn || null })}
        >
          <Label>Fecha de respuesta</Label>
          <InputBase type="date" />
        </TextField>
        <Input
          className="sm:col-span-2"
          label="Organismo, con el nombre oficial"
          hint="Para contar juntos «Min. Hacienda» y «Ministerio de Hacienda y Finanzas». Es lo que se publica y lo que usan las estadísticas."
          value={agency}
          onChange={setAgency}
          onBlur={() => agency !== (r.agencyNormalized ?? "") && void patch({ agencyNormalized: agency || null })}
          maxLength={200}
        />
      </div>
    </Block>
  );
}

function PendingAnswers({
  item,
  review,
}: {
  item: SubmissionDetail;
  review: (id: number, action: "apply" | "reject") => Promise<unknown>;
}) {
  return (
    <Block title="Respuestas para revisar">
      <p className="text-body-regular text-text-secondary text-pretty">
        Llegaron con el número de trámite pero sin la clave: cualquiera que sepa el número pudo mandarlas. Aplicala solo si la podés
        confirmar (por ejemplo, con el link a la respuesta).
      </p>
      {item.answers
        .filter((a) => a.reviewStatus === "pending")
        .map((a) => (
          <div key={a.id} className={cx(tileVariants({ size: "sm" }), "flex flex-col gap-3")}>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Dice que">{REQUEST_LABELS[a.status]}</Field>
              <Field label="Fecha de respuesta">{a.answeredOn && formatDate(a.answeredOn)}</Field>
              {a.summary && (
                <div className="sm:col-span-2">
                  <Field label="Resumen">{a.summary}</Field>
                </div>
              )}
              {a.url && (
                <div className="sm:col-span-2">
                  <Field label="Link">
                    <ExternalLink href={a.url} />
                  </Field>
                </div>
              )}
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" leadingIcon={RiCheckLine} onClick={() => void review(a.id, "apply")}>
                Aplicar al pedido
              </Button>
              <Button variant="tertiary" leadingIcon={RiCloseLine} onClick={() => void review(a.id, "reject")}>
                Rechazar
              </Button>
            </div>
          </div>
        ))}
    </Block>
  );
}

/** What the site would show of this submission, field by field (the same choice as store.ts). */
function publicPreview(item: SubmissionDetail, summary: string): [string, string][] {
  const r = item.request;
  if (r)
    return [
      ["Dato pedido", r.itemId === "otro" ? summary || "(falta el resumen)" : (titles[r.itemId] ?? r.itemId)],
      ["Organismo", r.agencyNormalized ?? r.agency ?? "Sin informar"],
      ["Presentado", formatDate(r.filedOn)],
      ["Estado", REQUEST_LABELS[r.status] ?? r.status],
      ...(r.answeredOn ? ([["Respondido", formatDate(r.answeredOn)]] as [string, string][]) : []),
      ...(r.itemId !== "otro" && summary ? ([["Qué respondió el Estado", summary]] as [string, string][]) : []),
      ...(r.answerUrl ? ([["Link a la respuesta", r.answerUrl]] as [string, string][]) : []),
    ];
  return [
    ["Resumen", summary || "(falta el resumen)"],
    ["Página", item.feedback?.page?.split("?")[0] ?? "—"],
  ];
}

function Publication({
  item,
  patch,
}: {
  item: SubmissionDetail;
  patch: (b: Record<string, unknown>) => Promise<SubmissionDetail | ApiError>;
}) {
  const [summary, setSummary] = useState(item.publicSummary ?? "");
  const [tags, setTags] = useState(item.tags.join(", "));
  const [isPublic, setIsPublic] = useState(item.isPublic);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [saved, setSaved] = useState(false);
  const publishable = item.request || item.type === "error" || item.type === "data";
  const dirty = summary !== (item.publicSummary ?? "") || tags !== item.tags.join(", ") || isPublic !== item.isPublic;

  async function save() {
    setSaved(false);
    const res = await patch({
      publicSummary: summary || null,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      isPublic,
      ...(acknowledged ? { acknowledgeWarnings: true } : {}),
    });
    if (res instanceof ApiError) {
      setWarnings(res.warnings);
      if (!res.warnings.length) setAcknowledged(false);
      return;
    }
    setWarnings([]);
    setAcknowledged(false);
    setSaved(true);
  }

  return (
    <Block title="Publicación" icon={<RiEyeLine className="size-4 text-foreground-icon-secondary" aria-hidden />}>
      {!publishable && (
        <p className="text-body-regular text-text-secondary">Las fotos y los envíos «otro» no se publican en el registro.</p>
      )}
      <Textarea
        label="Resumen público"
        hint={
          item.request
            ? "Qué respondió el Estado, en una o dos oraciones y sin nombres de personas. En los pedidos de «otro dato», es el título del pedido."
            : "Qué se corrigió, en una o dos oraciones. Lo escribe el equipo: el mensaje original no se publica nunca."
        }
        value={summary}
        onChange={(v) => {
          setSummary(v);
          setWarnings([]);
          setAcknowledged(false);
        }}
        rows={3}
        maxLength={600}
        showCount
      />
      <Input
        label="Etiquetas (separadas por comas)"
        hint="Solo para el equipo: no se publican."
        value={tags}
        onChange={setTags}
        maxLength={300}
      />
      {publishable && (
        <Switch isSelected={isPublic} onChange={setIsPublic}>
          <span className="text-body-medium">Publicar en el registro</span>
        </Switch>
      )}
      {publishable && isPublic && (
        <div className={cx(tileVariants({ size: "sm" }), "flex flex-col gap-3")}>
          <p className="text-caption-1-medium text-text-tertiary">Así se va a ver en {PUBLIC_SITE.replace("https://", "")}/registro</p>
          <dl className="grid gap-3 sm:grid-cols-2">
            {publicPreview(item, summary).map(([label, value]) => (
              <Field key={label} label={label}>
                {value}
              </Field>
            ))}
          </dl>
        </div>
      )}
      {warnings.length > 0 && (
        <Alert title="El resumen parece tener datos personales">
          <span className="flex flex-col gap-3">
            <span>
              Encontramos {warnings.map((w) => PRIVACY_LABELS[w] ?? w).join(", ")}. Sacalo del resumen, o confirmá que se puede publicar
              (por ejemplo, si es un número de expediente o un monto).
            </span>
            <Checkbox isSelected={acknowledged} onChange={setAcknowledged}>
              Revisé el resumen y se puede publicar
            </Checkbox>
          </span>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void save()} disabled={!dirty && !acknowledged}>
          Guardar
        </Button>
        {saved && !dirty && <span className="text-body-regular text-text-secondary">Guardado.</span>}
        {item.isPublic && item.isPublic === isPublic && (
          <a
            href={`${PUBLIC_SITE}/registro?codigo=${item.code}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-1 text-body-medium text-text-link hover:underline"
          >
            Ver en el sitio <RiExternalLinkLine className="size-4" aria-hidden />
          </a>
        )}
      </div>
    </Block>
  );
}

function Notes({ item, add }: { item: SubmissionDetail; add: (body: string) => Promise<unknown> }) {
  const [body, setBody] = useState("");
  return (
    <Block title="Notas del equipo">
      {item.notes.length > 0 && (
        <ul className="flex flex-col gap-3">
          {item.notes.map((n) => (
            <li key={n.id} className={cx(tileVariants({ size: "sm" }), "flex flex-col gap-1")}>
              <span className="text-caption-1-regular text-text-tertiary">
                {n.author} · {formatDate(n.createdAt)}
              </span>
              <span className="text-body-regular whitespace-pre-line">{n.body}</span>
            </li>
          ))}
        </ul>
      )}
      <Textarea label="Nueva nota" hint="Privada: la ve solo el equipo." value={body} onChange={setBody} rows={2} maxLength={4000} />
      <Button
        variant="secondary"
        className="w-fit"
        disabled={!body.trim()}
        onClick={() => {
          void add(body).then(() => setBody(""));
        }}
      >
        Agregar nota
      </Button>
    </Block>
  );
}

const ACTIONS: Record<string, string> = {
  update: "Cambió",
  note: "Agregó una nota",
  anonymize: "Anonimizó",
  "answer.apply": "Aplicó una respuesta",
  "answer.reject": "Rechazó una respuesta",
};

function History({ item }: { item: SubmissionDetail }) {
  if (!item.audit.length) return null;
  return (
    <Block title="Historial">
      <ul className="flex flex-col gap-2">
        {item.audit.map((a) => (
          <li key={a.id} className="text-body-regular text-text-secondary">
            <span className="text-text-primary">{a.actor}</span> · {ACTIONS[a.action] ?? a.action}
            {a.action === "update" && `: ${Object.keys(a.detail).join(", ")}`} · {formatDate(a.createdAt)}
          </li>
        ))}
      </ul>
    </Block>
  );
}

function Anonymize({ item, run }: { item: SubmissionDetail; run: (confirm: string) => Promise<unknown> }) {
  const [confirm, setConfirm] = useState("");
  return (
    <Block title="Borrar datos personales">
      <p className="text-body-regular text-text-secondary text-pretty">
        Si la persona pide que borremos lo que mandó (Ley 25.326), se borran el correo, el texto, el número de trámite y las notas, y se
        despublica. Quedan el dato pedido, el organismo, las fechas y el estado, para que los números sigan cerrando. No se puede deshacer.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Input label={`Escribí ${item.code} para confirmar`} value={confirm} onChange={setConfirm} autoComplete="off" maxLength={12} />
        <Button variant="danger" disabled={confirm.trim().toUpperCase() !== item.code} onClick={() => void run(confirm)}>
          Anonimizar
        </Button>
      </div>
    </Block>
  );
}
