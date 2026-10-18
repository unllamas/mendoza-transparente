import type { Finding, FindingInput, FindingKind, FindingSeverity, FindingStatus } from "@mt/participation/security";
import { Alert } from "@mt/ui/components/alert";
import { Button } from "@mt/ui/components/base/buttons/button";
import { IconButton } from "@mt/ui/components/base/buttons/icon-button";
import { Checkbox } from "@mt/ui/components/base/checkbox/checkbox";
import { Input, InputBase, TextField } from "@mt/ui/components/base/input/input";
import { Label } from "@mt/ui/components/base/input/label";
import { Select, SelectItem } from "@mt/ui/components/base/select/select";
import { Textarea } from "@mt/ui/components/base/textarea/textarea";
import { Sheet } from "@mt/ui/components/sheet";
import { StatusBadge } from "@mt/ui/components/status-badge";
import { useMediaQuery } from "@mt/ui/hooks/use-media-query";
import { cx } from "@mt/ui/lib/cx";
import { RiAddLine, RiLockLine, RiRefreshLine, RiShieldLine } from "@remixicon/react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { ApiError, api, useApi } from "../api.ts";
import { ScreenHeader } from "../components/layout.tsx";
import {
  FINDING_KIND_LABELS,
  FINDING_SEVERITY_LABELS,
  FINDING_STATUS_DOT,
  FINDING_STATUS_LABELS,
  formatDate,
  PRIVACY_LABELS,
} from "../labels.ts";

export interface SecuritySearch {
  hallazgo?: string;
}

/** "nuevo" in the URL opens the empty form. */
const NEW = "nuevo";

/**
 * Security problems found in State websites, kept here until they are reported. Never published: the rules
 * are in docs/procesos/seguridad.md.
 */
export function SecurityPage() {
  const search = useSearch({ from: "/seguridad" });
  const navigate = useNavigate({ from: "/seguridad" });
  const open = search.hallazgo ?? null;
  const select = (code: string | null) => void navigate({ search: { hallazgo: code ?? undefined }, replace: true, resetScroll: false });
  const list = useApi<Finding[]>("/api/panel/security");
  const items = list.data ?? [];
  const desktop = useMediaQuery("(min-width: 1024px)");

  const detail = open && (
    <FindingForm
      key={open}
      code={open === NEW ? null : open}
      onSaved={(code) => {
        list.reload();
        select(code);
      }}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader title="Seguridad">
        <IconButton icon={RiRefreshLine} aria-label="Actualizar" onClick={list.reload} />
        <Button onClick={() => select(NEW)}>
          <RiAddLine className="size-4" aria-hidden /> Nuevo hallazgo
        </Button>
      </ScreenHeader>

      <div className="border-separator-border border-b px-4 py-3 lg:px-6">
        <p className="flex max-w-3xl gap-2 text-body-regular text-text-secondary text-pretty">
          <RiLockLine className="mt-0.5 size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
          <span>
            Lo que se carga acá no se publica nunca. Describí dónde está el problema y cómo se ve,{" "}
            <strong className="font-medium text-text-primary">sin copiar ni descargar los datos expuestos</strong>. Se reporta al organismo
            responsable y a CERT.ar; si hay datos personales, también a la AAIP.
          </span>
        </p>
      </div>

      {list.error && (
        <div className="p-4">
          <Alert title="No se pudieron cargar los hallazgos">{list.error}</Alert>
        </div>
      )}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(20rem,26rem)_1fr]">
        <section aria-label="Hallazgos" className="flex min-w-0 flex-col border-separator-border lg:border-r">
          <div className="flex min-h-11 items-center border-separator-border border-b px-4 text-body-regular text-text-secondary">
            {list.data ? `${items.length} ${items.length === 1 ? "hallazgo" : "hallazgos"}` : "Cargando…"}
          </div>
          {list.data && items.length === 0 ? (
            <p className="p-6 text-body-regular text-text-tertiary text-pretty">Todavía no hay hallazgos cargados.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-separator-border">
              {items.map((f) => (
                <li key={f.code}>
                  <button
                    type="button"
                    aria-current={f.code === open}
                    onClick={() => select(f.code)}
                    className={cx(
                      "flex w-full min-w-0 flex-col gap-1.5 px-4 py-3 text-start hover:bg-background-interactive focus-visible:bg-background-interactive",
                      f.code === open && "bg-background-interactive",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-body-medium">{f.title}</span>
                      <span className="shrink-0 whitespace-nowrap font-mono text-caption-1-regular text-text-tertiary">
                        {formatDate(f.createdAt)}
                      </span>
                    </span>
                    <span className="truncate text-body-regular text-text-secondary">{f.agency ?? FINDING_KIND_LABELS[f.kind]}</span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono text-caption-1-regular text-text-tertiary">{f.code}</span>
                      <StatusBadge
                        status={FINDING_STATUS_DOT[f.status]}
                        label={FINDING_STATUS_LABELS[f.status]}
                        className="text-caption-1-regular"
                      />
                      <span className="text-caption-1-regular text-text-tertiary">
                        Gravedad {FINDING_SEVERITY_LABELS[f.severity].toLowerCase()}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="Hallazgo abierto" className="hidden min-w-0 lg:block">
          {open && desktop ? detail : <EmptyDetail />}
        </section>
      </div>
      {open && !desktop && (
        <Sheet title={open === NEW ? "Nuevo hallazgo" : open} onClose={() => select(null)}>
          {detail}
        </Sheet>
      )}
    </div>
  );
}

function EmptyDetail() {
  return (
    <div className="flex h-full min-h-80 flex-col items-center justify-center gap-3 p-8 text-center">
      <RiShieldLine className="size-8 text-foreground-icon-secondary" aria-hidden />
      <p className="text-headline-semibold">Elegí un hallazgo</p>
      <p className="max-w-sm text-body-regular text-text-secondary text-pretty">
        Abrí uno de la lista para seguir su reporte, o cargá uno nuevo.
      </p>
    </div>
  );
}

type Draft = Required<{ [K in keyof FindingInput]: NonNullable<FindingInput[K]> }>;

const EMPTY: Draft = {
  title: "",
  agency: "",
  location: "",
  kind: "personal_data",
  exposesPersonalData: false,
  severity: "medium",
  description: "",
  status: "new",
  reportedTo: "",
  reportedOn: "",
  reportReference: "",
  fixedOn: "",
};

const toDraft = (f: Finding): Draft => ({
  title: f.title,
  agency: f.agency ?? "",
  location: f.location ?? "",
  kind: f.kind,
  exposesPersonalData: f.exposesPersonalData,
  severity: f.severity,
  description: f.description,
  status: f.status,
  reportedTo: f.reportedTo ?? "",
  reportedOn: f.reportedOn ?? "",
  reportReference: f.reportReference ?? "",
  fixedOn: f.fixedOn ?? "",
});

/** One finding: what it is and where, and who it was reported to. New when `code` is null. */
function FindingForm({ code, onSaved }: { code: string | null; onSaved: (code: string) => void }) {
  const loaded = useApi<Finding>(code ? `/api/panel/security/${code}` : null);
  if (code && loaded.error)
    return (
      <div className="p-4">
        <Alert title="No se pudo abrir el hallazgo">{loaded.error}</Alert>
      </div>
    );
  if (code && !loaded.data) return <p className="p-6 text-body-regular text-text-tertiary">Cargando…</p>;
  return <FindingEditor code={code} initial={loaded.data ? toDraft(loaded.data) : EMPTY} meta={loaded.data} onSaved={onSaved} />;
}

function FindingEditor({
  code,
  initial,
  meta,
  onSaved,
}: {
  code: string | null;
  initial: Draft;
  meta?: Finding;
  onSaved: (code: string) => void;
}) {
  // What is saved: the form compares against it, and it moves forward after each save.
  const [base, setBase] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setMessage(null);
    if (key === "title" || key === "description") {
      setWarnings([]);
      setAcknowledged(false);
    }
  };
  const dirty = (Object.keys(draft) as (keyof Draft)[]).some((k) => draft[k] !== base[k]);

  async function save() {
    setSaving(true);
    setMessage(null);
    // Only what changed travels; an empty text clears the field.
    const body: Record<string, unknown> = Object.fromEntries(
      (Object.keys(draft) as (keyof Draft)[])
        .filter((k) => !code || draft[k] !== base[k])
        .map((k) => [k, draft[k] === "" ? null : draft[k]]),
    );
    if (acknowledged) body.acknowledgeWarnings = true;
    try {
      const saved = await api<Finding>(code ? `/api/panel/security/${code}` : "/api/panel/security", {
        method: code ? "PATCH" : "POST",
        body,
      });
      setBase(toDraft(saved));
      setDraft(toDraft(saved));
      setWarnings([]);
      setAcknowledged(false);
      setMessage({ kind: "ok", text: "Guardado." });
      onSaved(saved.code);
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError("No se pudo guardar.", 0);
      if (err.warnings.length) setWarnings(err.warnings);
      else setMessage({ kind: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-8 p-4 lg:p-6">
      {meta && (
        <header className="flex flex-col gap-1">
          <span className="font-mono text-body-medium">{meta.code}</span>
          <span className="text-caption-1-regular text-text-tertiary">
            Cargado por {meta.createdBy} el {formatDate(meta.createdAt)}
            {meta.updatedBy && meta.updatedAt && ` · último cambio de ${meta.updatedBy} el ${formatDate(meta.updatedAt)}`}
          </span>
        </header>
      )}

      <Block title="Qué se encontró">
        <Input label="Título" hint="Qué pasa, en pocas palabras." value={draft.title} onChange={(v) => set("title", v)} maxLength={200} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Tipo de problema" value={draft.kind} onChange={(v) => set("kind", String(v) as FindingKind)}>
            {Object.entries(FINDING_KIND_LABELS).map(([id, label]) => (
              <SelectItem key={id} id={id}>
                {label}
              </SelectItem>
            ))}
          </Select>
          <Select label="Gravedad" value={draft.severity} onChange={(v) => set("severity", String(v) as FindingSeverity)}>
            {Object.entries(FINDING_SEVERITY_LABELS).map(([id, label]) => (
              <SelectItem key={id} id={id}>
                {label}
              </SelectItem>
            ))}
          </Select>
          <Input label="Organismo responsable" value={draft.agency} onChange={(v) => set("agency", v)} maxLength={200} />
          <Input
            label="Dirección donde está"
            hint="La página o la carpeta, no el archivo con los datos."
            value={draft.location}
            onChange={(v) => set("location", v)}
            maxLength={500}
            inputMode="url"
          />
        </div>
        <Checkbox isSelected={draft.exposesPersonalData} onChange={(v) => set("exposesPersonalData", v)}>
          Expone datos personales de la gente
        </Checkbox>
        <Textarea
          label="Descripción"
          hint="Cómo se llega y qué tipo de dato queda expuesto («nombres y DNI de beneficiarios»). Nunca los datos en sí, ni capturas que los muestren."
          value={draft.description}
          onChange={(v) => set("description", v)}
          rows={5}
          maxLength={4000}
          showCount
        />
      </Block>

      <Block title="Reporte">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Estado" value={draft.status} onChange={(v) => set("status", String(v) as FindingStatus)}>
            {Object.entries(FINDING_STATUS_LABELS).map(([id, label]) => (
              <SelectItem key={id} id={id}>
                {label}
              </SelectItem>
            ))}
          </Select>
          <Input
            label="A quién se reportó"
            hint="El organismo, CERT.ar o la AAIP."
            value={draft.reportedTo}
            onChange={(v) => set("reportedTo", v)}
            maxLength={200}
          />
          <DateField label="Fecha del reporte" value={draft.reportedOn} onChange={(v) => set("reportedOn", v)} />
          <Input
            label="Número de ticket o expediente"
            value={draft.reportReference}
            onChange={(v) => set("reportReference", v)}
            maxLength={100}
          />
          <DateField label="Fecha en que se corrigió" value={draft.fixedOn} onChange={(v) => set("fixedOn", v)} />
        </div>
      </Block>

      {warnings.length > 0 && (
        <Alert title="El texto parece tener datos personales">
          <span className="flex flex-col gap-3">
            <span>
              Encontramos {warnings.map((w) => PRIVACY_LABELS[w] ?? w).join(", ")}. Si copiaste un dato expuesto, borralo y describí solo de
              qué tipo es. Si es otra cosa (un número de expediente, el correo del organismo), confirmalo.
            </span>
            <Checkbox isSelected={acknowledged} onChange={setAcknowledged}>
              Revisé el texto y no tiene datos de nadie
            </Checkbox>
          </span>
        </Alert>
      )}
      {message?.kind === "error" && <Alert title="No se pudo guardar">{message.text}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void save()} disabled={saving || (!dirty && !acknowledged) || (warnings.length > 0 && !acknowledged)}>
          {code ? "Guardar" : "Cargar hallazgo"}
        </Button>
        {message?.kind === "ok" && !dirty && <span className="text-body-regular text-text-secondary">{message.text}</span>}
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-headline-semibold">{title}</h2>
      {children}
    </section>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <TextField className="flex flex-col gap-1.5" value={value} onChange={onChange}>
      <Label>{label}</Label>
      <InputBase type="date" />
    </TextField>
  );
}
