import { Alert } from "@mt/ui/components/alert";
import { PersonAvatar } from "@mt/ui/components/avatar";
import { Select, SelectItem } from "@mt/ui/components/base/select/select";
import { listRowVariants, listVariants } from "@mt/ui/components/card";
import { PageHeader, Section } from "@mt/ui/components/section";
import { StatTile } from "@mt/ui/components/stat-tile";
import { RiArrowRightSLine, RiExternalLinkLine, RiFileTextLine, RiGlobalLine, RiPlaneLine, RiUserLine } from "@remixicon/react";
import { getRouteApi, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";

import { BarList } from "@/charts/bar-list.tsx";
import { WithBreadcrumbs } from "@/components/breadcrumbs.tsx";
import { ListSearch } from "@/components/list-search.tsx";
import { FuentesOficiales } from "@/components/official-sources.tsx";
import { ShareButton } from "@/components/share-button.tsx";
import { TrackedSheet } from "@/components/tracked-sheet.tsx";
import { COST_LABEL, COST_SENTENCE, CostChip, tripTitle } from "@/features/officials/components/trip-rows.tsx";
import { formatDate, formatNumber, normalizeText } from "@/lib.ts";
import type { Trip, TripCost } from "@/types.ts";
import { useUrlOption, useUrlText } from "@/url-state.ts";

const route = getRouteApi("/funcionarios/viajes");

const ALL = "todos";
const COSTS: TripCost[] = ["paga_provincia", "paga_tercero", "sin_costo", "sin_viaticos", "no_informa"];

const year = (t: Trip) => (t.from ?? t.normDate ?? t.published).slice(0, 4);

/** "26 al 29 ago 2026", "29 jun al 2 jul 2025", "26 ago 2026" o la fecha del decreto si no dice cuándo. */
function tripDates(t: Trip): string {
  if (!t.from) return `Decreto del ${formatDate(t.normDate ?? t.published)}`;
  if (!t.to || t.to === t.from) return formatDate(t.from);
  const withoutYear = (iso: string) => formatDate(iso).replace(/\s+\d{4}$/, "");
  if (t.from.slice(0, 4) !== t.to.slice(0, 4)) return `${formatDate(t.from)} al ${formatDate(t.to)}`;
  if (t.from.slice(0, 7) === t.to.slice(0, 7)) return `${Number(t.from.slice(8))} al ${formatDate(t.to)}`;
  return `${withoutYear(t.from)} al ${formatDate(t.to)}`;
}

/** `/funcionarios/viajes`: los viajes en misión oficial que autorizó el Gobierno de Mendoza por decreto. */
export function TripsPage() {
  const { trips } = route.useLoaderData();
  const router = useRouter();
  // El viaje abierto vive en la URL (?viaje=<id>): se comparte, se encuentra desde el buscador y "atrás" lo cierra.
  const search = useRouterState({ select: (st) => st.location.search as Record<string, unknown> });
  const open = trips.find((t) => t.id === String(search.viaje ?? "")) ?? null;
  const setOpen = (t: Trip | null) => {
    const url = new URL(window.location.href);
    if (t) url.searchParams.set("viaje", t.id);
    else url.searchParams.delete("viaje");
    void router.navigate({ href: `${url.pathname}${url.search}`, replace: !t, resetScroll: false });
  };

  const travelers = new Set(trips.flatMap((t) => t.travelers.map((x) => x.name))).size;
  const countries = new Set(trips.flatMap((t) => t.countries)).size;
  const paid = trips.filter((t) => t.cost === "paga_provincia").length;
  const silent = trips.filter((t) => t.cost === "no_informa").length;
  const firstYear = trips.map(year).sort()[0];

  return (
    <div className="flex flex-col gap-10">
      <WithBreadcrumbs items={[{ label: "Funcionarios", to: "/funcionarios" }]} current={{ label: "Viajes oficiales", icon: RiPlaneLine }}>
        <PageHeader action={<ShareButton />} title="Viajes oficiales">
          A dónde viajaron los funcionarios de Mendoza en misión oficial, para qué y qué dice cada decreto sobre quién lo pagó
          {firstYear ? `, desde ${firstYear}` : ""}.
        </PageHeader>
      </WithBreadcrumbs>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={RiFileTextLine} label="Viajes" value={formatNumber(trips.length)} note="Uno por decreto" />
        <StatTile icon={RiUserLine} label="Personas" value={formatNumber(travelers)} note="Que viajaron al menos una vez" />
        <StatTile icon={RiGlobalLine} label="Países" value={formatNumber(countries)} />
        <StatTile
          icon={RiPlaneLine}
          label="Pagó Mendoza"
          value={formatNumber(paid)}
          note={`Lo dice el decreto en ${paid} de ${trips.length}`}
        />
      </div>

      <Alert title="Casi ningún decreto dice cuánto costó el viaje">
        {silent} de {trips.length} no dicen nada sobre el costo, y ninguno trae el monto.{" "}
        <Link
          to="/no-publicado"
          search={{ dato: "costo-misiones-oficiales" } as never}
          data-track="trips.request.open"
          className="font-medium text-text-link hover:underline"
        >
          Pedí el gasto con la Ley 9070 ›
        </Link>
      </Alert>

      <Rankings trips={trips} />
      <TripList trips={trips} onOpen={setOpen} />

      {open && <TripSheet trip={open} onClose={() => setOpen(null)} />}

      <FuentesOficiales ids={["misiones-oficiales", "boletin-oficial"]} />
    </div>
  );
}

function Rankings({ trips }: { trips: Trip[] }) {
  const byCountry = new Map<string, number>();
  for (const t of trips) for (const c of t.countries) byCountry.set(c, (byCountry.get(c) ?? 0) + 1);
  const byPerson = new Map<string, { count: number; path: string | null }>();
  for (const t of trips) for (const x of t.travelers) byPerson.set(x.name, { count: (byPerson.get(x.name)?.count ?? 0) + 1, path: x.path });
  const countries = [...byCountry].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const people = [...byPerson].sort((a, b) => b[1].count - a[1].count).slice(0, 8);
  const plural = (n: number) => `${n} ${n === 1 ? "viaje" : "viajes"}`;
  return (
    <div className="grid items-start gap-8 lg:grid-cols-2">
      <Section id="destinos" title="A qué países">
        <BarList items={countries.map(([nombre, valor]) => ({ nombre, valor }))} formatValue={plural} />
      </Section>
      <Section id="quienes" title="Quiénes viajaron más">
        <BarList
          items={people.map(([nombre, v]) => ({
            nombre,
            valor: v.count,
            etiqueta: v.path ? (
              <Link to={v.path} data-track="trips.traveler.open" className="text-text-link hover:underline">
                {nombre}
              </Link>
            ) : undefined,
          }))}
          formatValue={plural}
        />
      </Section>
    </div>
  );
}

function TripList({ trips, onOpen }: { trips: Trip[]; onOpen: (t: Trip) => void }) {
  const years = [ALL, ...[...new Set(trips.map(year))].sort().reverse()];
  const [yearFilter, setYear] = useUrlOption("anio", years, ALL);
  const [cost, setCost] = useUrlOption<TripCost | typeof ALL>("costo", [ALL, ...COSTS], ALL);
  const [query, setQuery] = useUrlText("q");
  const indexed = useMemo(
    () =>
      trips.map((t) => ({
        t,
        text: normalizeText(
          [t.destination, ...t.countries, t.reason, t.issuer, ...t.travelers.map((x) => `${x.name} ${x.role}`)].join(" "),
        ),
      })),
    [trips],
  );
  const words = normalizeText(query.trim()).split(/\s+/).filter(Boolean);
  const shown = indexed
    .filter((x) => (yearFilter === ALL || year(x.t) === yearFilter) && (cost === ALL || x.t.cost === cost))
    .filter((x) => words.every((w) => x.text.includes(w)))
    .map((x) => x.t);

  return (
    <Section id="viajes" title="Todos los viajes">
      <ListSearch value={query} onChange={setQuery} placeholder="Buscar por persona, país, evento u organismo" label="Buscar viaje" />
      <div className="grid gap-2 sm:grid-cols-2">
        <Select aria-label="Año" value={yearFilter} onChange={(key) => setYear(String(key))}>
          {years.map((y) => (
            <SelectItem key={y} id={y}>
              {y === ALL ? "Todos los años" : y}
            </SelectItem>
          ))}
        </Select>
        <Select aria-label="Qué dice del costo" value={cost} onChange={(key) => setCost(key as TripCost | typeof ALL)}>
          {[ALL, ...COSTS].map((c) => (
            <SelectItem key={c} id={c}>
              {c === ALL ? "Cualquier costo" : COST_LABEL[c as TripCost]}
            </SelectItem>
          ))}
        </Select>
      </div>
      <p className="text-body-regular text-text-secondary">
        {shown.length === 0
          ? "Ningún viaje coincide. Probá con otro año o solo con el apellido."
          : `${formatNumber(shown.length)} ${shown.length === 1 ? "viaje" : "viajes"}, del más reciente al más viejo.`}
      </p>
      {shown.length > 0 && (
        <ul className={listVariants()}>
          {shown.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => onOpen(t)} className={listRowVariants()}>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium text-text-link">{tripTitle(t)}</span>
                  <span className="truncate text-body-regular text-text-tertiary">{t.travelers.map((x) => x.name).join(", ")}</span>
                  <span className="flex min-w-0 items-center gap-2 text-caption-1-regular text-text-tertiary">
                    <span className="truncate">{tripDates(t)}</span>
                    <span className="sm:hidden">
                      <CostChip cost={t.cost} />
                    </span>
                  </span>
                </span>
                <span className="hidden sm:block">
                  <CostChip cost={t.cost} />
                </span>
                <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function TripSheet({ trip: t, onClose }: { trip: Trip; onClose: () => void }) {
  return (
    <TrackedSheet title={tripTitle(t)} trackId="trips.trip" onClose={onClose}>
      <div className="flex flex-col gap-6">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-4 text-body-regular">
          <div className="col-span-2 flex flex-col gap-0.5">
            <dt className="text-text-tertiary">Cuándo</dt>
            <dd>
              {tripDates(t)}
              {t.days ? ` · ${t.days} ${t.days === 1 ? "día" : "días"}` : ""}
            </dd>
          </div>
          {t.reason && (
            <div className="col-span-2 flex flex-col gap-0.5">
              <dt className="text-text-tertiary">Para qué</dt>
              <dd className="text-pretty">{t.reason}</dd>
            </div>
          )}
          <div className="col-span-2 flex flex-col gap-0.5">
            <dt className="text-text-tertiary">Lo tramitó</dt>
            <dd>
              {t.agency ? (
                <Link
                  to="/gobierno/$slug"
                  params={{ slug: t.agency.slug }}
                  data-track="trips.agency.open"
                  className="text-text-link hover:underline"
                >
                  {t.agency.name}
                </Link>
              ) : (
                t.issuer
              )}
            </dd>
          </div>
        </dl>

        <section className="flex flex-col gap-2">
          <h4 className="text-body-semibold">Quiénes viajaron</h4>
          <ul className={listVariants()}>
            {t.travelers.map((x) => {
              const inner = (
                <>
                  <PersonAvatar name={x.name} photo={x.photo} className="size-10 text-caption-1-regular" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={x.path ? "truncate font-medium text-text-link" : "truncate font-medium"}>{x.name}</span>
                    <span className="truncate text-body-regular text-text-tertiary">{x.role || "El decreto no dice el cargo"}</span>
                  </span>
                  {x.path && <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />}
                </>
              );
              return (
                <li key={x.name}>
                  {x.path ? (
                    <Link to={x.path} data-track="trips.traveler.open" className={listRowVariants()}>
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex min-h-11 items-center gap-3 px-4 py-3">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h4 className="text-body-semibold">Quién lo pagó</h4>
          <CostChip cost={t.cost} />
          <p className="text-body-regular text-pretty text-text-secondary">{COST_SENTENCE[t.cost]}</p>
          {t.costText && (
            <blockquote className="border-l-2 border-separator-border pl-3 text-body-regular text-pretty text-text-secondary">
              «{t.costText}»
            </blockquote>
          )}
        </section>

        {t.url && (
          <a
            href={t.url}
            target="_blank"
            rel="noreferrer"
            data-track="trips.decree.open"
            className="inline-flex w-fit items-center gap-1.5 text-body-regular text-text-link hover:underline"
          >
            Leer el {t.norm} en el Boletín Oficial <RiExternalLinkLine className="size-4" aria-hidden />
          </a>
        )}
        <p className="text-caption-1-regular text-text-tertiary">
          Publicado el {formatDate(t.published)}. Los datos salen de leer el decreto con reglas automáticas: ante cualquier duda, vale el
          texto original.
        </p>
      </div>
    </TrackedSheet>
  );
}
