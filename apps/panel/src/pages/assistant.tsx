import type { AssistantCount, AssistantFeedback, AssistantGap, AssistantVote } from "@mt/participation/assistant";
import { Alert } from "@mt/ui/components/alert";
import { Sheet } from "@mt/ui/components/sheet";
import { StatTile } from "@mt/ui/components/stat-tile";
import { RiMessage2Line } from "@remixicon/react";
import { type ReactNode, useState } from "react";
import { useApi } from "../api.ts";
import { ScreenHeader } from "../components/layout.tsx";
import { ASSISTANT_GAP_LABELS, ASSISTANT_REASON_LABELS, formatDate } from "../labels.ts";

interface AssistantData {
  feedback: AssistantFeedback;
  gaps: AssistantGap[];
}
type VoteNote = Omit<AssistantVote, "hasNote"> & { note: string };

const when = (iso: string) =>
  `${formatDate(iso)} ${new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Mendoza" })}`;
const none = (v: string | null | undefined) => v || "—";

/** What people say about Aco's answers and what they ask for that we do not have yet. Never published. */
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
            Los últimos 50. La nota que escribe la persona al votar 👎 no se muestra acá: se abre de a una.
          </p>
          <Table
            head={["Fecha", "Voto", "Motivo", "Recorrido", "Municipio", ""]}
            rows={(f?.recent ?? []).map((v) => [
              when(v.createdAt),
              v.vote === "up" ? "👍" : "👎",
              v.reason ? (ASSISTANT_REASON_LABELS[v.reason] ?? v.reason) : "—",
              none(v.flow),
              none(v.municipality),
              v.hasNote ? (
                <button
                  key="note"
                  type="button"
                  onClick={() => setOpenVote(v.id)}
                  className="min-h-11 text-body-medium text-text-link hover:underline"
                >
                  Ver nota
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
        <Sheet title="Nota del voto" onClose={() => setOpenVote(null)}>
          <VoteNoteView id={openVote} />
        </Sheet>
      )}
    </div>
  );
}

/** Loads the note only when it is opened: the server audits that read. */
function VoteNoteView({ id }: { id: number }) {
  const { data, error } = useApi<VoteNote>(`/api/panel/assistant/votes/${id}`);
  return (
    <div className="flex flex-col gap-4 p-4">
      <Alert title="Puede traer datos personales">
        Es texto libre de la persona. No se publica ni se copia a otro lado, y quién lo abre queda en la auditoría.
      </Alert>
      {error && <Alert title="No se pudo cargar la nota">{error}</Alert>}
      {data && (
        <>
          <p className="text-caption-1-regular text-text-tertiary">
            {when(data.createdAt)} · {data.reason ? (ASSISTANT_REASON_LABELS[data.reason] ?? data.reason) : "Sin motivo"} ·{" "}
            {none(data.flow)} · {none(data.municipality)}
          </p>
          <p className="whitespace-pre-wrap break-words rounded-xl bg-background-surface p-4 text-body-regular text-pretty">
            {data.note || "No dejó nota."}
          </p>
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
