import type { AssistantCount, AssistantFeedback, AssistantGap, AssistantVoteDetail } from "@mt/participation/assistant";
import type { AssistantUsage } from "@mt/participation/assistant-usage";
import { Alert } from "@mt/ui/components/alert";
import { Sheet } from "@mt/ui/components/sheet";
import { StatTile } from "@mt/ui/components/stat-tile";
import { RiMessage2Line } from "@remixicon/react";
import { type ReactNode, useState } from "react";
import { useApi } from "../api.ts";
import { ScreenHeader } from "../components/layout.tsx";
import {
  ASSISTANT_GAP_LABELS,
  ASSISTANT_OUTCOME_LABELS,
  ASSISTANT_PROVIDER_LABELS,
  ASSISTANT_REASON_LABELS,
  ASSISTANT_TASK_LABELS,
  formatCompact,
  formatDate,
  formatSeconds,
  formatUsd,
} from "../labels.ts";

interface AssistantData {
  feedback: AssistantFeedback;
  gaps: AssistantGap[];
}

const when = (iso: string) =>
  `${formatDate(iso)} ${new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Mendoza" })}`;
const none = (v: string | null | undefined) => v || "—";

/** Lo que la gente opina de las respuestas de Aco y lo que pide y todavía no tenemos. Nunca se publica. */
export function AssistantPage() {
  const { data, error } = useApi<AssistantData>("/api/panel/assistant");
  const [openVote, setOpenVote] = useState<number | null>(null);
  const f = data?.feedback;
  const total = f ? f.up + f.down : 0;

  return (
    <div className="flex flex-col">
      <ScreenHeader title="Asistente" />
      <div className="flex max-w-5xl flex-col gap-10 p-4 lg:p-6">
        {error && <Alert title="No se pudo cargar lo del asistente">{error}</Alert>}

        <UsageSection />

        <section className="flex flex-col gap-3">
          <h2 className="text-headline-semibold">Opiniones</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <StatTile label="Les sirvió" value={f ? String(f.up) : "…"} />
            <StatTile label="No les sirvió" value={f ? String(f.down) : "…"} />
            <StatTile label="Votos" value={f ? String(total) : "…"} />
          </div>
        </section>

        <div className="grid gap-10 md:grid-cols-3">
          <CountTable title="No les sirvió, por motivo" head="Motivo" rows={f?.byReason} label={(k) => ASSISTANT_REASON_LABELS[k] ?? k} />
          <CountTable title="Por recorrido" head="Recorrido" rows={f?.byFlow} label={(k) => k} />
          <CountTable title="Por municipio" head="Municipio" rows={f?.byMunicipality} label={(k) => k} />
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-headline-semibold">Últimos votos</h2>
          <p className="text-body-regular text-text-secondary text-pretty">
            Los últimos 50. La conversación votada y la nota del 👎 no se muestran acá: se abren de a un voto.
          </p>
          <Table
            head={["Fecha", "Voto", "Motivo", "Recorrido", "Municipio", ""]}
            rows={(f?.recent ?? []).map((v) => [
              when(v.createdAt),
              v.vote === "up" ? "👍" : "👎",
              v.reason ? (ASSISTANT_REASON_LABELS[v.reason] ?? v.reason) : "—",
              none(v.flow),
              none(v.municipality),
              v.hasNote || v.hasConversation ? (
                <button
                  key="note"
                  type="button"
                  onClick={() => setOpenVote(v.id)}
                  className="min-h-11 text-body-medium text-text-link hover:underline"
                >
                  {v.hasConversation ? "Ver conversación" : "Ver nota"}
                </button>
              ) : (
                ""
              ),
            ])}
          />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-headline-semibold">Faltantes</h2>
          <p className="text-body-regular text-text-secondary text-pretty">
            Lo que la gente pidió y todavía no tenemos, de lo más pedido a lo menos. Sirve para decidir qué relevar primero.
          </p>
          <Table
            head={["Qué falta", "Tipo", "Municipio", "Veces", "Última vez"]}
            rows={(data?.gaps ?? []).map((g) => [g.value, ASSISTANT_GAP_LABELS[g.kind], none(g.municipality), g.n, formatDate(g.lastAt)])}
          />
        </section>
      </div>
      {openVote !== null && (
        <Sheet title="Voto" onClose={() => setOpenVote(null)}>
          <VoteNoteView id={openVote} />
        </Sheet>
      )}
    </div>
  );
}

/** Carga la conversación y la nota recién al abrir el voto: el servidor deja esa lectura en la auditoría. */
function VoteNoteView({ id }: { id: number }) {
  const { data, error } = useApi<AssistantVoteDetail>(`/api/panel/assistant/votes/${id}`);
  return (
    <div className="flex flex-col gap-4 p-4">
      <Alert title="Puede traer datos personales">
        Es texto de la persona: al guardarlo se tapan los correos, los CUIT y los números largos, pero puede quedar algo. No se publica ni
        se copia a otro lado, y quién lo abre queda en la auditoría. Para sumarlo a las evals, se reescribe sin datos de la persona.
      </Alert>
      {error && <Alert title="No se pudo cargar el voto">{error}</Alert>}
      {data && (
        <>
          <p className="text-caption-1-regular text-text-tertiary">
            {when(data.createdAt)} · {data.vote === "up" ? "👍" : "👎"} ·{" "}
            {data.reason ? (ASSISTANT_REASON_LABELS[data.reason] ?? data.reason) : "Sin motivo"} · {none(data.flow)} ·{" "}
            {none(data.municipality)}
          </p>
          {data.conversation.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-body-medium text-text-primary">Conversación</h3>
              <ol className="flex flex-col gap-2">
                {data.conversation.map((m, i) => (
                  <li
                    key={i}
                    className={
                      m.role === "user"
                        ? "flex flex-col gap-1 self-end rounded-xl bg-background-action p-3 sm:max-w-[85%]"
                        : "flex flex-col gap-1 rounded-xl bg-background-surface p-3 sm:max-w-[85%]"
                    }
                  >
                    <span className="text-caption-1-medium text-text-tertiary">{m.role === "user" ? "Persona" : "Aco"}</span>
                    <p className="whitespace-pre-wrap break-words text-body-regular text-pretty">{m.content}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {data.vote === "down" && (
            <section className="flex flex-col gap-2">
              <h3 className="text-body-medium text-text-primary">Nota</h3>
              <p className="whitespace-pre-wrap break-words rounded-xl bg-background-surface p-4 text-body-regular text-pretty">
                {data.note || "No dejó nota."}
              </p>
            </section>
          )}
        </>
      )}
      {!data && !error && (
        <span className="flex items-center gap-2 text-body-regular text-text-tertiary">
          <RiMessage2Line className="size-4" aria-hidden /> Cargando…
        </span>
      )}
    </div>
  );
}

const pct = (part: number, total: number) => (total ? `${Math.round((part / total) * 100)} %` : "—");

/**
 * Cuánto gasta Aco y en qué: últimos 30 días del widget (las evals van aparte). El costo es el que informa el proveedor
 * o, si no lo informa, una estimación con el precio público del modelo; se aclara cuánto es estimado.
 */
function UsageSection() {
  const { data: u, error } = useApi<AssistantUsage>("/api/panel/assistant/usage");
  const t = u?.totals;
  const ok = t ? t.answers - t.failedAnswers : 0;
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-headline-semibold">Consumo</h2>
        <p className="text-body-regular text-text-secondary text-pretty">
          Últimos 30 días del widget, sin las evals. Cada respuesta puede usar hasta 4 llamadas al modelo.
        </p>
      </div>
      {error && <Alert title="No se pudo cargar el consumo">{error}</Alert>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Gasto del mes" value={u ? formatUsd(u.monthUsd) : "…"} note="Desde el día 1" />
        <StatTile
          label="Gasto en 30 días"
          value={t ? formatUsd(t.costUsd) : "…"}
          note={t ? `${formatUsd(t.estimatedUsd)} estimado` : undefined}
        />
        <StatTile label="Costo por respuesta" value={t ? (ok ? formatUsd(t.costUsd / ok) : "—") : "…"} />
        <StatTile label="Respuestas" value={t ? formatCompact(t.answers) : "…"} note={t ? `${t.failedAnswers} fallaron` : undefined} />
        <StatTile
          label="Llamadas al modelo"
          value={t ? formatCompact(t.calls) : "…"}
          note={t ? `${pct(t.failedCalls, t.calls)} fallaron` : undefined}
        />
        <StatTile label="Tokens de entrada" value={t ? formatCompact(t.promptTokens) : "…"} />
        <StatTile label="Tokens de salida" value={t ? formatCompact(t.completionTokens) : "…"} />
        <StatTile label="Tiempo por respuesta" value={t ? (t.answers ? formatSeconds(t.avgAnswerMs) : "—") : "…"} note="Promedio" />
      </div>
      {t && t.unpricedCalls > 0 && (
        <Alert variant="note" title="Hay llamadas sin precio">
          {t.unpricedCalls} llamadas usaron un modelo sin precio público en OpenRouter y el proveedor no informó el costo: su gasto no está
          sumado.
        </Alert>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="text-body-medium text-text-primary">Por modelo</h3>
        <Table
          head={["Modelo", "Llamadas", "Entrada", "Salida", "Gasto", "Del total", "Tiempo"]}
          rows={(u?.byModel ?? []).map((m) => [
            // El nombre sin el proveedor («claude-haiku-5.5») entra en una línea; el id completo queda en el título.
            <span key="model" title={m.model} className="whitespace-nowrap">
              {m.model.split("/").at(-1)}
            </span>,
            formatCompact(m.calls),
            formatCompact(m.promptTokens),
            formatCompact(m.completionTokens),
            m.estimatedUsd > 0 && m.estimatedUsd >= m.costUsd ? `${formatUsd(m.costUsd)} (est.)` : formatUsd(m.costUsd),
            pct(m.costUsd, t?.costUsd ?? 0),
            m.calls ? formatSeconds(m.avgMs) : "—",
          ])}
        />
      </div>

      <div className="grid gap-10 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          <h3 className="text-body-medium text-text-primary">Por proveedor</h3>
          <Table
            head={["Proveedor", "Llamadas", "Fallaron", "Tiempo"]}
            rows={(u?.byProvider ?? []).map((p) => [
              <span key="p" className="flex flex-col">
                {ASSISTANT_PROVIDER_LABELS[p.provider] ?? p.provider}
                {p.failures.length > 0 && (
                  <span className="text-caption-1-regular text-text-tertiary">
                    {p.failures.map((f) => `${f.status.replace("http_", "HTTP ")} × ${f.n}`).join(" · ")}
                  </span>
                )}
              </span>,
              formatCompact(p.calls),
              `${p.failed} (${pct(p.failed, p.calls)})`,
              formatSeconds(p.avgMs),
            ])}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <h3 className="text-body-medium text-text-primary">Por tarea</h3>
          <Table
            head={["Tarea", "Llamadas", "Gasto"]}
            rows={(u?.byTask ?? []).map((k) => [ASSISTANT_TASK_LABELS[k.task], formatCompact(k.calls), formatUsd(k.costUsd)])}
          />
        </div>
      </div>

      <div className="grid gap-10 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          <h3 className="text-body-medium text-text-primary">Qué respondió</h3>
          <Table
            head={["Resultado", "Respuestas", "Del total"]}
            rows={(u?.byOutcome ?? []).map((o) => [
              ASSISTANT_OUTCOME_LABELS[o.key] ?? (o.key || "Sin dato"),
              formatCompact(o.n),
              pct(o.n, ok),
            ])}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <h3 className="text-body-medium text-text-primary">Por día</h3>
          <Table
            head={["Día", "Respuestas", "Fallaron", "Gasto"]}
            rows={(u?.byDay ?? []).map((d) => [formatDate(d.day), formatCompact(d.answers), d.failed, formatUsd(d.costUsd)])}
          />
        </div>
      </div>

      {u && u.evals.answers > 0 && (
        <p className="text-body-regular text-text-secondary text-pretty">
          Aparte, las evals hicieron {u.evals.answers} respuestas y gastaron {formatUsd(u.evals.costUsd)} en el mismo período.
        </p>
      )}
    </section>
  );
}

function CountTable({
  title,
  head,
  rows,
  label,
}: {
  title: string;
  head: string;
  rows?: AssistantCount[];
  label: (key: string) => string;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h2 className="text-headline-semibold">{title}</h2>
      <Table head={[head, "Votos"]} rows={(rows ?? []).map((r) => [r.key ? label(r.key) : "Sin dato", r.n])} />
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  if (rows.length === 0) return <p className="text-body-regular text-text-tertiary">Todavía no hay datos.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="bui-table">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className={j ? "tabular-nums whitespace-nowrap" : "min-w-32"}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
