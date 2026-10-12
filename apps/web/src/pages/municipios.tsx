import { getRouteApi, Link } from "@tanstack/react-router";
import { ChevronRight, Coins, MapPin, Users, Vote } from "lucide-react";

import { ColumnChart } from "../charts/column-chart.tsx";
import { FuentesOficiales } from "../fuente.tsx";
import { formatNumber } from "../lib.ts";
import { Aviso, Migas, PageHeader, Section, StatTile } from "./components.tsx";
import { Avatar } from "./funcionarios.tsx";

const FUENTES = ["hacienda-participacion-municipal", "poblacion", "autoridades", "legislatura"];
const pesos = (v: number) => `$ ${formatNumber(Math.round(v))}`;
const listaRoute = getRouteApi("/municipios");
const detalleRoute = getRouteApi("/municipios/$slug");

export function MunicipiosPage() {
  const municipios = listaRoute.useLoaderData();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader icon={MapPin} tema="Municipios" titulo="Los 18 municipios de Mendoza">
        Quién gobierna cada uno, cuántos habitantes tiene y cuánta coparticipación recibe por habitante.
      </PageHeader>
      <FuentesOficiales ids={FUENTES} />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {municipios.map((m) => (
          <li key={m.slug} className="min-w-0">
            <Link
              to="/municipios/$slug"
              params={{ slug: m.slug }}
              className="group flex h-full flex-col gap-3 rounded-xl border border-line bg-surface p-4 hover:border-link"
            >
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight group-hover:text-link">{m.nombre}</span>
                <ChevronRight className="size-4 shrink-0 text-ink-muted group-hover:text-link" aria-hidden />
              </span>
              <span className="truncate text-sm text-ink-2">{m.intendente ? `Intendente: ${m.intendente.nombre}` : "Sin intendente cargado"}</span>
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span className="whitespace-nowrap text-ink-muted">Habitantes</span>
                <span className="font-medium whitespace-nowrap tabular-nums">{formatNumber(m.poblacion.actual)}</span>
              </span>
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span className="whitespace-nowrap text-ink-muted">Coparticipación por habitante</span>
                <span className="font-medium whitespace-nowrap tabular-nums">{m.coparticipacion ? pesos(m.coparticipacion.perCapita) : "—"}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MunicipioPage() {
  const municipios = detalleRoute.useLoaderData();
  const { slug } = detalleRoute.useParams();
  const m = municipios.find((x) => x.slug === slug);
  if (!m) {
    return (
      <div className="flex flex-col gap-4">
        <Migas items={[{ label: "Municipios", to: "/municipios" }, { label: "No encontrado" }]} />
        <h1 className="text-2xl font-semibold tracking-tight">No encontramos ese municipio</h1>
        <Link to="/municipios" className="w-fit text-link hover:underline">
          Ver los 18 municipios ›
        </Link>
      </div>
    );
  }
  const c = m.coparticipacion;
  const i = m.intendente;
  return (
    <div className="flex flex-col gap-10">
      <Migas items={[{ label: "Municipios", to: "/municipios" }, { label: m.nombre }]} />
      <PageHeader icon={MapPin} tema="Municipio" titulo={m.nombre}>
        Habitantes, coparticipación por habitante y quiénes lo representan en la Legislatura.
      </PageHeader>
      <FuentesOficiales ids={FUENTES} />

      {i && (
        <Link
          to="/funcionarios/$id"
          params={{ id: i.id }}
          className="group flex items-center gap-4 rounded-xl border border-line bg-surface p-4 hover:border-link"
        >
          <Avatar persona={{ nombre: i.nombre, foto: i.foto } as never} className="size-14 text-base" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm text-ink-muted">Intendente</span>
            <span className="truncate text-lg font-medium group-hover:text-link">{i.nombre}</span>
            <span className="truncate text-sm text-ink-2">{[i.partido, i.mandatoHasta && `hasta ${i.mandatoHasta}`].filter(Boolean).join(" · ")}</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-ink-muted group-hover:text-link" aria-hidden />
        </Link>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <StatTile icon={Users} label="Habitantes" value={formatNumber(m.poblacion.actual)} note={`Puesto ${m.poblacion.puesto} de 18`} />
        <StatTile
          icon={Coins}
          label="Coparticipación por habitante"
          value={c ? pesos(c.perCapita) : "—"}
          note={c ? `Puesto ${c.puesto} de 18 · ${c.anio}, en pesos de ${c.referencia}` : "Sin datos"}
        />
        <StatTile icon={Vote} label="Sección electoral" value={m.seccion ?? "—"} note="Define a quiénes eligen sus vecinos en la Legislatura" />
      </div>

      {c && c.serie.length > 1 && (
        <Section title={`Coparticipación por habitante, en pesos de ${c.referencia}`}>
          <ColumnChart
            columnas={c.serie.map((s) => ({ etiqueta: String(s.anio), valor: s.perCapita }))}
            formatValue={pesos}
            ariaLabel={`Coparticipación por habitante de ${m.nombre} por año`}
          />
          {m.poblacion.actual < 20000 && (
            <Aviso tipo="nota">Los municipios chicos reciben más por habitante porque parte del reparto es un piso fijo.</Aviso>
          )}
        </Section>
      )}

      {m.legisladores.length > 0 && (
        <Section title={`Legisladores provinciales de la sección ${m.seccion?.toLowerCase() ?? ""}`}>
          <p className="-mt-2 text-sm text-ink-muted">Tocá uno para ver su ficha.</p>
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl bg-tile">
            {m.legisladores.map((l) => (
              <li key={l.id}>
                <Link to="/funcionarios/$id" params={{ id: l.id }} className="group flex items-center gap-4 px-4 py-3 hover:bg-grid/50">
                  <Avatar persona={{ nombre: l.nombre, foto: l.foto } as never} className="size-10 text-xs" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium group-hover:text-link">{l.nombre}</span>
                    <span className="truncate text-sm text-ink-muted">{[l.cargo, l.bloque].filter(Boolean).join(" · ")}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-ink-muted group-hover:text-link" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
