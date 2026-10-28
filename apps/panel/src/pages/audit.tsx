import type { AuditEntry } from "@mt/participation/store";
import { Alert } from "@mt/ui/components/alert";
import { Link } from "@tanstack/react-router";
import { useApi } from "../api.ts";
import { ScreenHeader } from "../components/layout.tsx";
import { formatDate } from "../labels.ts";

const ACTIONS: Record<string, string> = {
  update: "Cambió",
  note: "Agregó una nota a",
  anonymize: "Anonimizó",
  "answer.apply": "Aplicó una respuesta a",
  "answer.reject": "Rechazó una respuesta de",
  export: "Exportó la bandeja",
  "security.create": "Cargó el hallazgo de seguridad",
  "security.update": "Cambió el hallazgo de seguridad",
  "assistant.note.read": "Leyó la nota de un voto del asistente",
};

/** Who changed what. Only appended to: the panel has no way to edit or delete it. */
export function AuditPage() {
  const { data, error } = useApi<AuditEntry[]>("/api/panel/audit");
  return (
    <div className="flex flex-col">
      <ScreenHeader title="Auditoría" />
      <div className="flex max-w-4xl flex-col gap-4 p-4 lg:p-6">
        <p className="text-body-regular text-text-secondary text-pretty">
          Cada cambio que se hace desde el panel, con quién lo hizo. Los últimos 300. No se puede editar ni borrar.
        </p>
        {error && <Alert title="No se pudo cargar la auditoría">{error}</Alert>}
        {data?.length === 0 && <p className="text-body-regular text-text-tertiary">Todavía no hay cambios.</p>}
        <ul className="flex flex-col divide-y divide-separator-border">
          {data?.map((a) => (
            <li key={a.id} className="flex min-h-11 flex-col gap-0.5 py-2.5">
              <span className="text-body-regular">
                <span className="font-medium">{a.actor}</span> {ACTIONS[a.action] ?? a.action}{" "}
                {a.targetCode?.startsWith("S-") ? (
                  <Link to="/seguridad" search={{ hallazgo: a.targetCode }} className="font-mono text-text-link hover:underline">
                    {a.targetCode}
                  </Link>
                ) : (
                  a.targetCode && (
                    <Link
                      to="/bandeja"
                      search={{ estado: "all", envio: a.targetCode }}
                      className="font-mono text-text-link hover:underline"
                    >
                      {a.targetCode}
                    </Link>
                  )
                )}
              </span>
              <span className="truncate text-caption-1-regular text-text-tertiary">
                {formatDate(a.createdAt)} {new Date(a.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                {Object.keys(a.detail).length > 0 && ` · ${Object.keys(a.detail).join(", ")}`}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
