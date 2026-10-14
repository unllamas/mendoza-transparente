import { Alert } from "@mt/ui/components/alert";
import { StatTile } from "@mt/ui/components/stat-tile";
import type { ReactNode } from "react";
import { type PanelStats, type ReviewStatus, type SubmissionType, useApi } from "../api.ts";
import { ScreenHeader } from "../components/layout.tsx";
import { REVIEW_LABELS, TYPE_LABELS } from "../labels.ts";

const pct = (part: number, total: number) => (total ? `${Math.round((part / total) * 100)} %` : "—");

/** How much the State answers, by agency, and what reaches the inbox each month. Spam and discarded do not count. */
export function StatsPage() {
  const { data, error } = useApi<PanelStats>("/api/panel/stats");
  const r = data?.requests;
  const months = [...new Set(data?.monthly.map((m) => m.month) ?? [])].reverse();
  const types: SubmissionType[] = ["request", "error", "data", "photo", "other"];

  return (
    <div className="flex flex-col">
      <ScreenHeader title="Estadísticas" />
      <div className="flex max-w-5xl flex-col gap-10 p-4 lg:p-6">
        {error && <Alert title="No se pudieron cargar las estadísticas">{error}</Alert>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Pedidos" value={String(r?.requests ?? "…")} />
          <StatTile label="Con respuesta" value={r ? pct(r.answered, r.requests) : "…"} note={r ? `${r.answered} pedidos` : undefined} />
          <StatTile
            label="Negados o vencidos"
            value={r ? pct(r.denied + r.overdue, r.requests) : "…"}
            note={r ? `${r.denied + r.overdue} pedidos` : undefined}
          />
          <StatTile label="Días hasta la respuesta" value={r?.medianDays != null ? String(r.medianDays) : "—"} note="mediana" />
        </div>

        <Table
          title="Por organismo"
          hint="Se cuenta con el nombre oficial que carga el equipo en cada pedido; sin él, con el que escribió la persona."
          head={["Organismo", "Pedidos", "Respondidos", "Negados", "Vencidos", "Esperando", "Días (mediana)"]}
          rows={(data?.byAgency ?? []).map((a) => [
            a.agency,
            a.requests,
            `${a.answered} (${pct(a.answered, a.requests)})`,
            a.denied,
            a.overdue,
            a.pending,
            a.medianDays ?? "—",
          ])}
        />

        <Table
          title="Envíos por mes"
          head={["Mes", ...types.map((t) => TYPE_LABELS[t])]}
          rows={months.map((m) => [m, ...types.map((t) => data?.monthly.find((x) => x.month === m && x.type === t)?.n ?? 0)])}
        />

        <Table
          title="Reportes por estado de revisión"
          head={["Tipo", ...(Object.keys(REVIEW_LABELS) as ReviewStatus[]).map((s) => REVIEW_LABELS[s])]}
          rows={types
            .filter((t) => t !== "request")
            .map((t) => [
              TYPE_LABELS[t],
              ...(Object.keys(REVIEW_LABELS) as ReviewStatus[]).map(
                (s) => data?.feedback.find((f) => f.type === t && f.reviewStatus === s)?.n ?? 0,
              ),
            ])}
        />
      </div>
    </div>
  );
}

function Table({ title, hint, head, rows }: { title: string; hint?: string; head: string[]; rows: ReactNode[][] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-headline-semibold">{title}</h2>
      {hint && <p className="text-body-regular text-text-secondary text-pretty">{hint}</p>}
      {rows.length === 0 ? (
        <p className="text-body-regular text-text-tertiary">Todavía no hay datos.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="bui-table">
            <thead>
              <tr>
                {head.map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className={j ? "tabular-nums whitespace-nowrap" : "min-w-48"}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
