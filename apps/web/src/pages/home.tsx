import { Link, getRouteApi } from "@tanstack/react-router";

import { formatDate, formatNumber } from "../lib.ts";
import { Section, StatTile } from "./components.tsx";

const route = getRouteApi("/");

const TEMAS = [
  { to: "/deuda", titulo: "¿Cuánto debe Mendoza?", bajada: "Deuda pública en dólares, por mandato, acreedor y moneda." },
  {
    to: "/empleo-publico",
    titulo: "¿Cuántos empleados públicos tiene?",
    bajada: "Empleados provinciales cada mil habitantes, comparado con las 24 jurisdicciones.",
  },
] as const;

export function HomePage() {
  const { sources, datasets } = route.useLoaderData();
  const withData = sources.filter((s) => datasets.some((d) => d.source === s.id));
  const pending = sources.filter((s) => !datasets.some((d) => d.source === s.id));
  const totalRows = datasets.reduce((sum, d) => sum + d.rowCount, 0);
  const lastFetch = sources
    .map((s) => s.raw.lastFetch)
    .filter((f): f is string => f !== null)
    .sort()
    .at(-1);

  return (
    <div className="flex flex-col gap-12">
      <div className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-tight text-balance">Los datos públicos de Mendoza, en claro.</h1>
        <p className="text-lg text-ink-2 text-pretty">
          Presupuesto, deuda, compras, Boletín Oficial y coparticipación: reunimos lo que publica el Estado, lo ordenamos
          y te lo mostramos con la fuente original siempre a mano.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Fuentes relevadas" value={formatNumber(sources.length)} />
        <StatTile label="Fuentes con datos" value={formatNumber(withData.length)} />
        <StatTile label="Tablas publicadas" value={formatNumber(datasets.length)} />
        <StatTile
          label="Registros"
          value={formatNumber(totalRows)}
          note={lastFetch ? `Última descarga: ${formatDate(lastFetch)}` : undefined}
        />
      </div>

      <Section title="Temas">
        <div className="grid gap-3 md:grid-cols-2">
          {TEMAS.map((tema) => (
            <Link
              key={tema.to}
              to={tema.to}
              className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-axis"
            >
              <span className="font-medium">{tema.titulo}</span>
              <span className="text-sm text-ink-2">{tema.bajada}</span>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="Datos disponibles">
        {withData.length === 0 ? (
          <p className="text-ink-2">Todavía no hay datos procesados. Estamos cargando las primeras fuentes.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {withData.map((s) => {
              const own = datasets.filter((d) => d.source === s.id);
              return (
                <Link
                  key={s.id}
                  to="/datos/$fuente"
                  params={{ fuente: s.id }}
                  className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-axis"
                >
                  <span className="font-medium">{s.nombre}</span>
                  {s.organismo && <span className="text-sm text-ink-2">{s.organismo}</span>}
                  <span className="text-sm text-ink-muted">
                    {own.length} {own.length === 1 ? "tabla" : "tablas"} ·{" "}
                    {formatNumber(own.reduce((sum, d) => sum + d.rowCount, 0))} registros
                    {s.raw.lastFetch && ` · ${formatDate(s.raw.lastFetch)}`}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </Section>

      {pending.length > 0 && (
        <Section title="En preparación">
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
            {pending.map((s) => (
              <li key={s.id} className="flex flex-col gap-0.5 px-4 py-3">
                <span className="text-sm font-medium">{s.nombre}</span>
                {s.organismo && <span className="text-sm text-ink-muted">{s.organismo}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
