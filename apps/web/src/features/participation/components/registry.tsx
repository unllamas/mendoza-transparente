import { buttonClassName } from "@mt/ui/components/base/buttons/button";
import { listRowVariants, listVariants } from "@mt/ui/components/card";
import { StatusBadge } from "@mt/ui/components/status-badge";
import { cx } from "@mt/ui/lib/cx";
import { RiArrowRightSLine, RiExternalLinkLine } from "@remixicon/react";
import { Link } from "@tanstack/react-router";
import { TrackedSheet } from "@/components/tracked-sheet.tsx";
import type { PublicCorrection, PublicRequest } from "@/features/participation/api/registry.ts";
import { formatDate } from "@/lib.ts";

/** Status of a request as the site names it. Overdue wins over "waiting": it is what matters. */
export function requestStatus(r: PublicRequest): { label: string; status: "good" | "warning" | "critical" | "neutral" } {
  if (r.status === "respondido") return { label: "Respondido", status: "good" };
  if (r.status === "parcial") return { label: "Respondido en parte", status: "warning" };
  if (r.status === "denegado") return { label: "Denegado", status: "critical" };
  if (r.overdue) return { label: "Vencido sin respuesta", status: "critical" };
  return { label: "Esperando respuesta", status: "neutral" };
}

const days = (n: number) => (n === 1 ? "1 día" : `${n} días`);

/** What was requested: the item's title, or the team's summary for "other" requests. */
export const requestTitle = (r: PublicRequest, titles: Record<string, string>) =>
  titles[r.itemId] ?? (r.itemId === "otro" ? (r.summary ?? "Otro dato") : r.itemId);

export function RequestList({
  requests,
  titles,
  onOpen,
}: {
  requests: PublicRequest[];
  titles: Record<string, string>;
  onOpen: (code: string) => void;
}) {
  return (
    <ul className={listVariants()}>
      {requests.map((r) => {
        const s = requestStatus(r);
        return (
          <li key={r.code}>
            <button
              type="button"
              id={`registro-abrir-${r.code}`}
              onClick={() => onOpen(r.code)}
              data-track="registry.request.open"
              data-track-item={r.itemId}
              className={cx(listRowVariants(), "gap-4")}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate font-medium group-hover:text-text-link">{requestTitle(r, titles)}</span>
                <span className="truncate text-body-regular text-text-tertiary">
                  {r.agency ?? "Organismo sin informar"} · {formatDate(r.filedOn)}
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <StatusBadge status={s.status} label={s.label} />
                  <span className="text-caption-1-regular whitespace-nowrap text-text-tertiary tabular-nums">
                    {r.status === "presentado" || r.status === "sin_respuesta"
                      ? `${days(r.days)} esperando`
                      : `respondió en ${days(r.days)}`}
                  </span>
                </span>
              </span>
              <RiArrowRightSLine className="size-4 shrink-0 text-text-link" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function CorrectionList({ corrections, onOpen }: { corrections: PublicCorrection[]; onOpen: (code: string) => void }) {
  return (
    <ul className={listVariants()}>
      {corrections.map((c) => (
        <li key={c.code}>
          <button
            type="button"
            id={`registro-abrir-${c.code}`}
            onClick={() => onOpen(c.code)}
            data-track="registry.correction.open"
            className={cx(listRowVariants(), "gap-4")}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="line-clamp-2 font-medium text-pretty group-hover:text-text-link">{c.summary}</span>
              <span className="truncate text-body-regular text-text-tertiary">
                {c.type === "error" ? "Error corregido" : "Dato sumado"}
                {c.resolvedOn ? ` · ${formatDate(c.resolvedOn)}` : ""}
                {c.page ? ` · ${c.page}` : ""}
              </span>
            </span>
            <RiArrowRightSLine className="size-4 shrink-0 text-text-link" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption-1-regular text-text-tertiary">{label}</dt>
      <dd className="text-body-regular text-text-primary text-pretty">{children}</dd>
    </div>
  );
}

export function RequestSheet({
  request: r,
  titles,
  onClose,
}: {
  request: PublicRequest;
  titles: Record<string, string>;
  onClose: () => void;
}) {
  const s = requestStatus(r);
  return (
    <TrackedSheet title={requestTitle(r, titles)} onClose={onClose} trackId="registry.request">
      <div className="flex flex-col gap-6">
        <StatusBadge status={s.status} label={s.label} />
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Organismo">{r.agency ?? "Sin informar"}</Field>
          <Field label="Presentado">{formatDate(r.filedOn)}</Field>
          <Field label={r.answeredOn ? "Respondido" : "Esperando"}>
            {r.answeredOn ? `${formatDate(r.answeredOn)} (${days(r.days)})` : days(r.days)}
          </Field>
          <Field label="Código">
            <span className="font-mono">{r.code}</span>
          </Field>
        </dl>
        {r.summary && r.itemId !== "otro" && <Field label="Qué respondió el Estado">{r.summary}</Field>}
        <p className="text-body-regular text-text-tertiary text-pretty">
          La Ley 9070 le da al organismo 15 días hábiles para responder. Contamos como vencido un pedido sin respuesta a los 21 días
          corridos.
        </p>
        <div className="flex flex-wrap gap-2">
          {r.answerUrl && (
            <a
              href={r.answerUrl}
              target="_blank"
              rel="noreferrer nofollow"
              className={buttonClassName({ variant: "secondary" })}
              data-track="registry.answer.open"
            >
              Ver la respuesta <RiExternalLinkLine className="size-4" aria-hidden />
            </a>
          )}
          {titles[r.itemId] && (
            <Link to="/no-publicado" search={{ dato: r.itemId } as never} className={buttonClassName({ variant: "tertiary" })}>
              Pedir este dato vos también ›
            </Link>
          )}
        </div>
      </div>
    </TrackedSheet>
  );
}

export function CorrectionSheet({ correction: c, onClose }: { correction: PublicCorrection; onClose: () => void }) {
  return (
    <TrackedSheet title={c.type === "error" ? "Error corregido" : "Dato sumado"} onClose={onClose} trackId="registry.correction">
      <div className="flex flex-col gap-6">
        <p className="text-body-regular text-text-primary text-pretty">{c.summary}</p>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Nos avisaron">{formatDate(c.reportedOn)}</Field>
          {c.resolvedOn && <Field label="Lo resolvimos">{formatDate(c.resolvedOn)}</Field>}
          <Field label="Código">
            <span className="font-mono">{c.code}</span>
          </Field>
        </dl>
        {c.page && (
          <a href={c.page} className={cx(buttonClassName({ variant: "secondary" }), "w-fit")} data-track="registry.correction.page">
            Ir a la página corregida ›
          </a>
        )}
      </div>
    </TrackedSheet>
  );
}
