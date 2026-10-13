import { buttonClassName } from "@mt/ui/components/base/buttons/button";
import { tileVariants } from "@mt/ui/components/card";
import { Section } from "@mt/ui/components/section";
import { StatusBadge } from "@mt/ui/components/status-badge";
import { cn } from "@mt/ui/lib/utils";
import { getRouteApi, Link } from "@tanstack/react-router";
import { ExternalLink, Table2 } from "lucide-react";

import { formatBytes, formatDate } from "@/lib.ts";
import type { SourceMeta } from "@/types.ts";

const route = getRouteApi("/fuentes");

/** State of a source in sources.yaml, as shown on the page. */
const SOURCE_STATUS: Record<string, { status: "good" | "warning" | "critical"; label: string }> = {
  activo: { status: "good", label: "Activa" },
  pendiente: { status: "warning", label: "Pendiente" },
  roto: { status: "critical", label: "Con errores" },
};

export function FuentesPage() {
  const { sources, datasets } = route.useLoaderData();
  const conDatos = sources.filter((s) => datasets.some((d) => d.source === s.id));
  const pendientes = sources.filter((s) => !datasets.some((d) => d.source === s.id));

  return (
    <div className="flex flex-col gap-12">
      <div className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Fuentes</h1>
        <p className="text-ink-2 text-pretty">
          De dónde sale cada dato. Descargamos los archivos oficiales de cada organismo y guardamos cada versión con su fecha, para que nada
          se pierda aunque después lo borren o lo cambien.
        </p>
      </div>

      <Section title="Con datos">
        <ul className="flex flex-col gap-3">
          {conDatos.map((s) => (
            <FuenteItem key={s.id} source={s} tables={datasets.filter((d) => d.source === s.id).length} />
          ))}
        </ul>
      </Section>

      {pendientes.length > 0 && (
        <Section title="En preparación">
          <ul className="flex flex-col gap-3">
            {pendientes.map((s) => (
              <FuenteItem key={s.id} source={s} tables={0} />
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function FuenteItem({ source: s, tables }: { source: SourceMeta; tables: number }) {
  return (
    <li className={cn(tileVariants(), "flex flex-col gap-3 md:flex-row md:items-start md:justify-between")}>
      <div className="flex max-w-2xl flex-col gap-1">
        <span className="font-medium">{s.nombre}</span>
        {s.descripcion && <span className="text-sm text-ink-2 text-pretty">{s.descripcion}</span>}
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-muted">
          {s.organismo && <span>{s.organismo}</span>}
          {s.frecuencia && <span className="sm:whitespace-nowrap">Se publica: {s.frecuencia}</span>}
          {s.raw.lastFetch && (
            <span className="sm:whitespace-nowrap">
              Última descarga: {formatDate(s.raw.lastFetch)} ({formatBytes(s.raw.bytes)})
            </span>
          )}
        </span>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 md:flex-col md:items-end">
        <StatusBadge {...(SOURCE_STATUS[s.estado] ?? { status: "neutral", label: s.estado })} />
        <div className="flex gap-2">
          {tables > 0 && (
            <Link to="/datos/$fuente" params={{ fuente: s.id }} className={buttonClassName({ variant: "secondary" })}>
              <Table2 className="size-4" aria-hidden /> Ver datos
            </Link>
          )}
          {s.url && (
            <a href={s.url} className={buttonClassName({ variant: "secondary" })}>
              Fuente oficial <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
        </div>
      </div>
    </li>
  );
}
