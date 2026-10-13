import { Alert } from "@mt/ui/components/alert";
import { PersonAvatar } from "@mt/ui/components/avatar";
import { buttonClassName } from "@mt/ui/components/base/buttons/button";
import { cardVariants, tileVariants } from "@mt/ui/components/card";
import { PageHeader, Section } from "@mt/ui/components/section";
import { StatTile } from "@mt/ui/components/stat-tile";
import { cn } from "@mt/ui/lib/utils";
import { getRouteApi, Link } from "@tanstack/react-router";
import {
  Building2,
  ChevronRight,
  Coins,
  ExternalLink,
  FileSignature,
  ScrollText,
  Search,
  ShoppingCart,
  UserRound,
  UsersRound,
} from "lucide-react";

import { ColumnChart } from "@/charts/column-chart.tsx";
import { LineChart } from "@/charts/line-chart.tsx";
import { Breadcrumbs } from "@/components/breadcrumbs.tsx";
import { FuentesOficiales } from "@/components/official-sources.tsx";
import { GOBIERNOS } from "@/gobiernos.ts";
import { formatDate, formatNumber } from "@/lib.ts";
import type { AgencyDetail, AgencySummary, GobiernoOverview } from "@/types.ts";

const SOURCES = ["lrf-personal", "etica-publica", "compras-ocds", "designaciones"];
const listApi = getRouteApi("/gobierno");
const detailApi = getRouteApi("/gobierno/$slug");

const GROUPS = [
  {
    id: "gobernacion",
    title: "Gobernación",
    description: "El gobernador, la vicegobernación y las unidades que dependen directamente de ellos.",
  },
  { id: "ministerio", title: "Ministerios", description: "Los siete ministerios que fija la Ley 9501." },
  { id: "organismo_control", title: "Organismos de control", description: "Controlan las cuentas y la legalidad de los actos del Estado." },
  {
    id: "ente",
    title: "Entes, fuerzas y organismos descentralizados",
    description: "Tienen presupuesto o conducción propios, pero dependen de un ministerio.",
  },
  { id: "empresa", title: "Empresas y sociedades del Estado", description: "Sociedades con participación de la Provincia." },
  { id: "poder", title: "Otros poderes", description: "Legislatura, Poder Judicial y ministerios públicos." },
] as const;
const GOVERNORSHIP = new Set(["gobernacion", "vicegobernacion", "unidad-promendoza"]);
const POWERS = new Set(["poder-legislativo", "poder-judicial", "ministerio-publico-fiscal", "ministerio-publico-de-la-defensa"]);
const groupOf = (a: AgencySummary): (typeof GROUPS)[number]["id"] =>
  GOVERNORSHIP.has(a.slug)
    ? "gobernacion"
    : POWERS.has(a.slug)
      ? "poder"
      : a.kind === "ministerio" || a.kind === "organismo_control" || a.kind === "empresa"
        ? a.kind
        : "ente";

const billions = (v: number) => `$ ${formatNumber(Math.round(v / 1e9))} mil M`;
const millionsOrBillions = (v: number) => (v >= 1e9 ? billions(v) : `$ ${formatNumber(Math.round(v / 1e6))} M`);
const pesos = (v: number) => `$ ${formatNumber(Math.round(v))}`;
const periodLabel = (p: string) => p.replace(/^(\d{4})-T(\d)$/, "$2.º trimestre de $1");

export function GobiernoPage() {
  const { agencies, overview } = listApi.useLoaderData();
  const totalStaff = agencies.reduce((s, a) => s + (a.staff ?? 0), 0);
  const totalCost = agencies.reduce((s, a) => s + (a.annualCostReal ?? 0), 0);
  const period = agencies.find((a) => a.staffPeriod)?.staffPeriod;
  return (
    <div className="flex flex-col gap-10">
      <PageHeader icon={Building2} topic="Gobierno por dentro" title="Cómo está organizado el Estado de Mendoza">
        Cada ministerio y organismo: quién lo conduce, cuántos cargos tiene, cuánto cuesta su personal, qué hace y qué compra.
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile
          icon={UsersRound}
          label="Cargos de planta en el Estado provincial"
          value={formatNumber(totalStaff)}
          note={period ? `${periodLabel(period)}, sin contar la Legislatura` : undefined}
        />
        <StatTile icon={Coins} label="Costo anual del personal" value={billions(totalCost)} note="Último año completo, en pesos de hoy" />
      </div>
      <Alert variant="note">
        Son cargos, no personas: una persona puede ocupar más de un cargo y los docentes suman además horas cátedra. Mendoza no publica la
        nómina con nombres.{" "}
        <Link to="/no-publicado" search={{ dato: "nomina-sueldos" } as never} className="font-medium text-link hover:underline">
          Pedila ›
        </Link>
      </Alert>

      {overview && <Overview overview={overview} />}

      {GROUPS.map((k) => {
        const list = agencies.filter((a) => groupOf(a) === k.id);
        if (!list.length) return null;
        return (
          <Section key={k.title} title={k.title}>
            <p className="-mt-2 text-sm text-ink-muted">{k.description}</p>
            <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl bg-tile">
              {list.map((a) => (
                <li key={a.slug}>
                  <AgencyRow agency={a} />
                </li>
              ))}
            </ul>
          </Section>
        );
      })}

      <FuentesOficiales ids={SOURCES} />
    </div>
  );
}

function AgencyRow({ agency: a }: { agency: AgencySummary }) {
  return (
    <Link to="/gobierno/$slug" params={{ slug: a.slug }} className="group flex items-center gap-4 px-4 py-3 hover:bg-grid/50 sm:px-5">
      {a.head ? (
        <PersonAvatar name={a.head.name} photo={a.head.photo} className="size-10 text-xs" />
      ) : (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-grid" aria-hidden>
          <Building2 className="size-4 text-ink-muted" />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium group-hover:text-link">{a.name}</span>
        <span className="truncate text-sm text-ink-muted">{a.head ? `${a.head.name} · ${a.head.role}` : "Conducción no informada"}</span>
      </span>
      {a.staff ? (
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="font-medium whitespace-nowrap tabular-nums">{formatNumber(a.staff)}</span>
          <span className="text-xs whitespace-nowrap text-ink-muted">cargos</span>
        </span>
      ) : null}
      <ChevronRight className="size-4 shrink-0 text-link" aria-hidden />
    </Link>
  );
}

export function AgencyPage() {
  const a = detailApi.useLoaderData();
  const { slug } = detailApi.useParams();
  if (!a) {
    return (
      <div className="flex flex-col gap-4">
        <Breadcrumbs items={[{ label: "Gobierno por dentro", to: "/gobierno" }, { label: "No encontrado" }]} />
        <h1 className="text-2xl font-semibold tracking-tight">No encontramos el organismo «{slug}»</h1>
        <Link to="/gobierno" className="w-fit text-link hover:underline">
          Ver todos los organismos ›
        </Link>
      </div>
    );
  }
  const latest = a.staffSeries.at(-1);
  const yearly = a.staffSeries.filter((p, i, all) => p.period.endsWith("-T4") || i === all.length - 1);
  return (
    <div className="flex flex-col gap-10">
      <Breadcrumbs
        items={[
          { label: "Gobierno por dentro", to: "/gobierno" },
          ...(a.parent ? [{ label: a.parent.name, to: `/gobierno/${a.parent.slug}` }] : []),
          { label: a.name },
        ]}
      />
      <PageHeader icon={Building2} topic={a.parent ? `Depende de ${a.parent.name}` : "Gobierno de Mendoza"} title={a.name}>
        {a.whatItDoes ?? "Quién lo conduce, cuántos cargos tiene, cuánto cuesta su personal y qué compra."}
      </PageHeader>

      {a.head && <HeadCard head={a.head} />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={UsersRound}
          label="Cargos de planta"
          value={a.staff ? formatNumber(a.staff) : "—"}
          note={a.staffPeriod ? periodLabel(a.staffPeriod) : "No figura en el informe"}
        />
        <StatTile
          icon={Coins}
          label="Costo anual del personal"
          value={a.annualCostReal ? millionsOrBillions(a.annualCostReal) : "—"}
          note={a.realReference ? `Último año completo, en pesos de ${a.realReference}` : undefined}
        />
        <StatTile
          icon={UserRound}
          label="Costo mensual por cargo"
          value={a.monthlyCostPerPosition ? pesos(a.monthlyCostPerPosition) : "—"}
          note="Promedio: costo del año ÷ cargos ÷ 12"
        />
        <StatTile
          icon={FileSignature}
          label="Contratos de locación"
          value={latest ? formatNumber(latest.contracts) : "—"}
          note={latest?.teachingHours ? `Además, ${formatNumber(latest.teachingHours)} horas cátedra` : "Personal contratado, no de planta"}
        />
      </div>
      {(a.staff || a.annualCostReal) && (
        <Alert variant="note">
          Son cargos liquidados según el informe trimestral de Responsabilidad Fiscal, no personas. El costo es lo liquidado en el año e
          incluye el aguinaldo, por eso el promedio mensual es aproximado.
        </Alert>
      )}

      {a.points.length > 0 && (
        <Section title="Qué hace">
          <ul className="flex flex-col gap-2.5">
            {a.points.map((p) => (
              <li key={p} className="flex gap-3 text-ink-2">
                <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                <span className="text-pretty">{p}</span>
              </li>
            ))}
          </ul>
          {a.law && (
            <p className="text-sm text-ink-muted">
              Según {a.law}.{" "}
              {a.lawUrl && (
                <a href={a.lawUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">
                  Texto oficial <ExternalLink className="size-3.5" aria-hidden />
                </a>
              )}
            </p>
          )}
        </Section>
      )}

      {yearly.length > 1 && (
        <Section title="Cargos de planta por año">
          <ColumnChart
            columnas={yearly.map((p) => ({
              etiqueta: p.period.slice(0, 4),
              valor: p.permanent + p.temporary,
              detalle: `${formatNumber(p.contracts)} contratados`,
            }))}
            formatValue={(v) => `${formatNumber(v)} cargos`}
            ariaLabel={`Cargos de planta de ${a.name} por año`}
          />
          <p className="text-xs text-ink-muted">Al cierre de cada año (cuarto trimestre); el último es el trimestre más reciente.</p>
        </Section>
      )}

      {a.costByYear.length > 1 && (
        <Section title={`Costo del personal por año, en pesos de ${a.realReference ?? "hoy"}`}>
          <ColumnChart
            columnas={a.costByYear.map((c) => ({
              etiqueta: c.complete ? String(c.year) : `${c.year}*`,
              valor: c.real,
              detalle: `${billions(c.nominal)} nominales`,
            }))}
            formatValue={millionsOrBillions}
            ariaLabel={`Costo del personal de ${a.name} por año`}
          />
          {a.costByYear.some((c) => !c.complete) && (
            <p className="text-xs text-ink-muted">* Año en curso: acumulado hasta el último trimestre publicado.</p>
          )}
        </Section>
      )}

      {a.budget.length > 1 && <BudgetSection agency={a} />}

      {a.units.length > 0 && (
        <Section title="Dónde están los cargos">
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl bg-tile">
            {a.units.map((u) => (
              <li key={u.name} className="flex items-center gap-4 px-4 py-3 sm:px-5">
                <span className="min-w-0 flex-1 truncate">{u.name}</span>
                <span className="shrink-0 font-medium whitespace-nowrap tabular-nums">{formatNumber(u.staff)} cargos</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {a.team.length > 0 && (
        <Section title={`Equipo de conducción (${a.teamTotal})`}>
          <p className="-mt-2 text-sm text-ink-muted">
            Funcionarios con obligación de presentar declaración jurada, según la Oficina de Ética Pública.
            {a.teamTotal > a.team.length && ` Se muestran los ${a.team.length} de mayor jerarquía.`}
          </p>
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl bg-tile">
            {a.team.map((t) => {
              const content = (
                <>
                  <PersonAvatar name={t.name} photo={t.photo} className="size-10 text-xs" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={`truncate font-medium ${t.path ? "group-hover:text-link" : ""}`}>{t.name}</span>
                    <span className="truncate text-sm text-ink-muted">{t.role}</span>
                  </span>
                  {t.since && (
                    <span className="hidden shrink-0 text-sm whitespace-nowrap text-ink-muted sm:block">desde {formatDate(t.since)}</span>
                  )}
                  {t.path && <ChevronRight className="size-4 shrink-0 text-link" aria-hidden />}
                </>
              );
              return (
                <li key={`${t.name}-${t.role}`}>
                  {t.path ? (
                    <Link to={t.path} className="group flex items-center gap-4 px-4 py-3 hover:bg-grid/50 sm:px-5">
                      {content}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-4 px-4 py-3 sm:px-5">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
          <a
            href="https://eticapublica.mendoza.gov.ar/declaraciones"
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-1 text-sm text-link hover:underline"
          >
            Ver sus declaraciones juradas en Ética Pública <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </Section>
      )}

      {a.purchases && <Purchases agency={a} />}

      <Section title="Designaciones recientes">
        {a.appointments.length > 0 ? (
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl bg-tile">
            {a.appointments.map((d) => (
              <li key={`${d.url}-${d.person}`}>
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center gap-4 px-4 py-3 hover:bg-grid/50 sm:px-5"
                >
                  <PersonAvatar name={d.person} photo={d.photo} className="size-10 text-xs" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium group-hover:text-link">{d.person}</span>
                    <span className="truncate text-sm text-ink-muted">
                      {[ACTIONS[d.action] ?? d.action, d.role, d.unit].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm whitespace-nowrap text-ink-muted">{formatDate(d.date)}</span>
                  <ExternalLink className="size-3.5 shrink-0 text-link" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-2">No encontramos designaciones de este organismo en los Boletines que tenemos procesados.</p>
        )}
        <p className="text-xs text-ink-muted">
          Según los decretos y resoluciones del Boletín Oficial que ya procesamos; la cobertura todavía es parcial. No todos los
          nombramientos se publican en el Boletín.
        </p>
      </Section>

      {a.children.length > 0 && (
        <Section title="Organismos que dependen de este">
          <ul className="flex flex-wrap gap-2">
            {a.children.map((c) => (
              <li key={c.slug}>
                <Link
                  to="/gobierno/$slug"
                  params={{ slug: c.slug }}
                  className={buttonClassName({ variant: "secondary", className: "rounded-full font-normal" })}
                >
                  {c.name} <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(a.note || a.before.length > 0) && (
        <Alert variant="note" title="Para tener en cuenta">
          {a.before.length > 0 && <p>Antes: {a.before.join(" · ")}.</p>}
          {a.note && <p className="mt-1">{a.note}</p>}
        </Alert>
      )}

      <Link to="/no-publicado" className="inline-flex w-fit items-center gap-2 text-sm text-link hover:underline">
        <ScrollText className="size-4" aria-hidden /> Lo que el Estado no publica sobre su personal ›
      </Link>

      <FuentesOficiales ids={SOURCES} />
    </div>
  );
}

const ACTIONS: Record<string, string> = {
  designa: "Designación",
  renuncia: "Renuncia",
  cese: "Cese",
  subrogancia: "Subrogancia",
  fin_de_funciones: "Fin de funciones",
  interina: "Designación interina",
};

function HeadCard({ head }: { head: NonNullable<AgencyDetail["head"]> }) {
  const content = (
    <>
      <PersonAvatar name={head.name} photo={head.photo} className="size-14 text-base" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm text-ink-muted">Lo conduce</span>
        <span className={`truncate text-lg font-medium ${head.path ? "group-hover:text-link" : ""}`}>{head.name}</span>
        <span className="truncate text-sm text-ink-2">{head.role}</span>
      </span>
      {head.path && <ChevronRight className="size-4 shrink-0 text-link" aria-hidden />}
    </>
  );
  return head.path ? (
    <Link to={head.path} className={cn(cardVariants(), "flex items-center gap-4")}>
      {content}
    </Link>
  ) : (
    <div className={cn(tileVariants(), "flex items-center gap-4")}>{content}</div>
  );
}

function Purchases({ agency: a }: { agency: AgencyDetail }) {
  const p = a.purchases!;
  return (
    <Section title="Qué compra">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          icon={ShoppingCart}
          label="Procesos de compra"
          value={formatNumber(p.processes)}
          note={`${billions(p.total)} adjudicados en total`}
        />
        <StatTile label="Por contratación directa" value={`${Math.round(p.direct)} %`} note="De los procesos" />
        <StatTile label="Con una sola oferta" value={`${Math.round(p.singleBid)} %`} note="De los que informan ofertas" />
      </div>
      {p.topSuppliers.length > 0 && (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl bg-tile">
          {p.topSuppliers.map((s) => {
            const content = (
              <>
                <span className={`min-w-0 flex-1 truncate ${s.slug ? "group-hover:text-link" : ""}`}>{s.name}</span>
                <span className="shrink-0 font-medium whitespace-nowrap tabular-nums">{millionsOrBillions(s.amount)}</span>
                {s.slug && <ChevronRight className="size-4 shrink-0 text-link" aria-hidden />}
              </>
            );
            return (
              <li key={s.name}>
                {s.slug ? (
                  <Link
                    to="/proveedores/$slug"
                    params={{ slug: s.slug }}
                    className="group flex items-center gap-4 px-4 py-3 hover:bg-grid/50 sm:px-5"
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="flex items-center gap-4 px-4 py-3 sm:px-5">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {p.buyers.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-ink-muted">Áreas que compran:</span>
          <ul className="flex flex-wrap gap-2">
            {p.buyers.map((b) => (
              <li key={b.slug}>
                <Link
                  to="/organismos/$slug"
                  params={{ slug: b.slug }}
                  className={buttonClassName({ variant: "secondary", className: "rounded-full font-normal" })}
                >
                  {b.name} <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

/** Positions in each year's budget law, compared with the latest quarterly report. */
function BudgetSection({ agency: a }: { agency: AgencyDetail }) {
  const current = [...a.budget].reverse().find((b) => !b.project);
  const project = a.budget.find((b) => b.project);
  return (
    <Section title="Cargos en la Ley de Presupuesto">
      <ColumnChart
        columnas={a.budget.map((b) => ({
          etiqueta: b.project ? `${b.year}*` : String(b.year),
          valor: b.positions,
          detalle: b.vacancies !== null ? `${formatNumber(b.vacancies)} sin ocupar` : undefined,
        }))}
        formatValue={(v) => `${formatNumber(v)} cargos`}
        ariaLabel={`Cargos de ${a.name} en cada Ley de Presupuesto`}
      />
      <p className="text-sm text-ink-2 text-pretty">
        {current && (
          <>
            El Presupuesto {current.year} registra {formatNumber(current.positions)} cargos ocupados
            {current.vacancies ? ` y ${formatNumber(current.vacancies)} sin ocupar (retenidos o vacantes en trámite)` : ""}.
          </>
        )}
        {a.staff && a.staffPeriod && ` El último informe trimestral (${periodLabel(a.staffPeriod)}) liquidó ${formatNumber(a.staff)}.`}
        {project && ` El proyecto ${project.year} prevé ${formatNumber(project.positions)}.`}
      </p>
      <p className="text-xs text-ink-muted">
        Planillas 8.2 y 8.6 de cada Ley de Presupuesto: cargos ocupados al mes de corte, sin contratados ni horas cátedra.
        {project && " * Proyecto, todavía no aprobado."}
      </p>
    </Section>
  );
}

/** Total staff over time and agencies that stand out: signals that deserve an explanation, not accusations. */
function Overview({ overview: o }: { overview: GobiernoOverview }) {
  const first = o.series[0]!;
  const last = o.series.at(-1)!;
  const up = o.changes.filter((c) => c.pct >= 1).slice(0, 5);
  const down = [...o.changes]
    .reverse()
    .filter((c) => c.pct <= -1)
    .slice(0, 5);
  const yearEnds = o.series.filter((p, i, all) => p.period.endsWith("-T4") || i === all.length - 1);
  return (
    <>
      <Section title="Cómo cambió la planta del Estado">
        <LineChart
          data={o.series.map((p) => ({ fecha: p.date, valor: p.staff }))}
          bands={GOBIERNOS.map((g) => ({ desde: g.desde, hasta: g.hasta, label: g.nombre }))}
          formatValue={(v) => `${formatNumber(v)} cargos`}
          formatAxis={(v) => formatNumber(v)}
          formatDate={(f) => periodLabel(o.series.find((p) => p.date === f)?.period ?? f)}
          ariaLabel="Cargos de planta del Estado provincial por trimestre"
        />
        <p className="text-sm text-ink-2 text-pretty">
          De {formatNumber(first.staff)} cargos de planta en el {periodLabel(first.period)} a {formatNumber(last.staff)} en el{" "}
          {periodLabel(last.period)}. Los contratos de locación pasaron de {formatNumber(first.contracts)} a {formatNumber(last.contracts)}.
        </p>
        <h3 className="pt-2 text-sm font-semibold">Contratos de locación al cierre de cada año</h3>
        <ColumnChart
          columnas={yearEnds.map((p) => ({ etiqueta: p.period.slice(0, 4), valor: p.contracts }))}
          formatValue={(v) => `${formatNumber(v)} contratados`}
          ariaLabel="Contratos de locación del Estado provincial por año"
        />
      </Section>

      <Section title="Para mirar de cerca">
        <p className="-mt-2 text-sm text-ink-muted text-pretty">
          Cambios en la planta desde el inicio de la gestión actual ({periodLabel(o.baseline)}) y organismos con más contratados. No son
          irregularidades: son preguntas que cada organismo podría explicar.
        </p>
        <div className="grid gap-6 lg:grid-cols-2">
          <ChangeList title="Los que más cargos sumaron" items={up} />
          <ChangeList title="Los que más cargos redujeron" items={down} />
        </div>
        {o.contractShare.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Contratados cada 100 cargos de planta</h3>
            <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl bg-tile">
              {o.contractShare.map((c) => (
                <li key={c.slug}>
                  <Link
                    to="/gobierno/$slug"
                    params={{ slug: c.slug }}
                    className="group flex items-center gap-4 px-4 py-3 hover:bg-grid/50 sm:px-5"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate group-hover:text-link">{c.name}</span>
                      <span className="truncate text-sm text-ink-muted">
                        {formatNumber(c.contracts)} contratados · {formatNumber(c.staff)} cargos de planta
                      </span>
                    </span>
                    <span className="shrink-0 font-medium whitespace-nowrap tabular-nums">{Math.round(c.ratio)}</span>
                    <ChevronRight className="size-4 shrink-0 text-link" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="flex items-start gap-2 text-xs text-ink-muted">
          <Search className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Los marcados con * cambiaron de áreas entre gestiones, así que la comparación no es exacta: parte de la diferencia puede ser un
          traspaso a otro organismo.
        </p>
      </Section>
    </>
  );
}

function ChangeList({ title, items }: { title: string; items: GobiernoOverview["changes"] }) {
  if (!items.length) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl bg-tile">
        {items.map((c) => (
          <li key={c.slug}>
            <Link to="/gobierno/$slug" params={{ slug: c.slug }} className="group flex items-center gap-4 px-4 py-3 hover:bg-grid/50">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate group-hover:text-link">
                  {c.name}
                  {c.restructured && " *"}
                </span>
                <span className="truncate text-sm text-ink-muted tabular-nums">
                  {formatNumber(c.from)} → {formatNumber(c.to)} cargos
                </span>
              </span>
              <span className="shrink-0 font-medium whitespace-nowrap tabular-nums">
                {c.pct > 0 ? "+" : ""}
                {Math.round(c.pct)} %
              </span>
              <ChevronRight className="size-4 shrink-0 text-link" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
