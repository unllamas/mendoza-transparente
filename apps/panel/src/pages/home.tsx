import type { Finding } from "@mt/participation/security";
import { Alert } from "@mt/ui/components/alert";
import { listRowVariants, listVariants } from "@mt/ui/components/card";
import { StatTile } from "@mt/ui/components/stat-tile";
import { cx } from "@mt/ui/lib/cx";
import { RiArrowRightSLine } from "@remixicon/react";
import { Link } from "@tanstack/react-router";
import { type Counts, type InboxItem, type PanelStats, useApi } from "../api.ts";
import { itemHeadline } from "../components/inbox-list.tsx";
import { ScreenHeader } from "../components/layout.tsx";
import { shortWhen } from "../labels.ts";

/** What needs attention today: new submissions, answers to check and overdue requests. */
export function HomePage() {
  const fresh = useApi<{ items: InboxItem[]; counts: Counts }>("/api/panel/inbox?status=new");
  const requests = useApi<{ items: InboxItem[] }>("/api/panel/inbox?type=request");
  const stats = useApi<PanelStats>("/api/panel/stats");
  const security = useApi<Finding[]>("/api/panel/security");
  const unreported = (security.data ?? []).filter((f) => f.status === "new");
  const overdue = (requests.data?.items ?? []).filter((i) => i.overdue && i.requestStatus === "presentado");
  const pending = (requests.data?.items ?? []).filter((i) => i.pendingAnswers > 0);
  const error = fresh.error ?? requests.error ?? stats.error;

  return (
    <div className="flex flex-col">
      <ScreenHeader title="Inicio" />
      <div className="flex max-w-4xl flex-col gap-8 p-4 lg:p-6">
        {error && <Alert title="No se pudo cargar el panel">{error}</Alert>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Nuevos sin revisar" value={String(fresh.data?.counts.new ?? "…")} />
          <StatTile label="Respuestas para revisar" value={String(stats.data?.pendingAnswers ?? "…")} />
          <StatTile label="Pedidos vencidos" value={String(stats.data?.requests.overdue ?? "…")} />
          <StatTile
            label="Respondidos"
            value={stats.data ? `${stats.data.requests.answered} de ${stats.data.requests.requests}` : "…"}
            note={stats.data?.requests.medianDays != null ? `en ${stats.data.requests.medianDays} días (mediana)` : undefined}
          />
        </div>
        {unreported.length > 0 && (
          <Alert
            title={
              unreported.length === 1
                ? "Hay un hallazgo de seguridad sin reportar"
                : `Hay ${unreported.length} hallazgos de seguridad sin reportar`
            }
          >
            <Link to="/seguridad" search={{ hallazgo: unreported[0]?.code }} className="font-medium text-text-link hover:underline">
              Ver en Seguridad ›
            </Link>
          </Alert>
        )}
        <Group title="Respuestas para revisar" items={pending} empty="No hay respuestas esperando revisión." />
        <Group
          title="Nuevos"
          items={(fresh.data?.items ?? []).slice(0, 8)}
          empty="No hay envíos nuevos."
          more={fresh.data && fresh.data.items.length > 8}
        />
        <Group
          title="Pedidos vencidos sin respuesta"
          items={overdue}
          empty="Ningún pedido pasó el plazo sin respuesta."
          hint="Pasaron más de 21 días corridos (los 15 hábiles de la Ley 9070). Si la persona dejó su correo, se le puede escribir para saber si le respondieron."
        />
      </div>
    </div>
  );
}

function Group({ title, items, empty, hint, more }: { title: string; items: InboxItem[]; empty: string; hint?: string; more?: boolean }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-headline-semibold">{title}</h2>
      {hint && <p className="text-body-regular text-text-secondary text-pretty">{hint}</p>}
      {items.length === 0 ? (
        <p className="text-body-regular text-text-tertiary">{empty}</p>
      ) : (
        <ul className={listVariants()}>
          {items.map((i) => (
            <li key={i.code}>
              <Link to="/bandeja" search={{ estado: "all", envio: i.code }} className={cx(listRowVariants(), "gap-4")}>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium group-hover:text-text-link">{itemHeadline(i)}</span>
                  <span className="truncate text-body-regular text-text-tertiary">
                    <span className="font-mono">{i.code}</span> · {i.context ?? "—"} · {shortWhen(i.createdAt)}
                  </span>
                </span>
                <RiArrowRightSLine className="size-4 shrink-0 text-text-link" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {more && (
        <Link to="/bandeja" className="min-h-11 text-body-medium text-text-link hover:underline">
          Ver todos los nuevos en la bandeja ›
        </Link>
      )}
    </section>
  );
}
