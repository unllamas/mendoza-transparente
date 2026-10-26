import { listRowVariants, listVariants } from "@mt/ui/components/card";
import { SearchSelect } from "@mt/ui/components/search-select";
import { Section } from "@mt/ui/components/section";
import { Skeleton } from "@mt/ui/components/skeleton";
import { RiArrowRightSLine } from "@remixicon/react";
import type { ReactNode } from "react";
import { AuditSection, DepartmentDetailView, Message, Selectors, SourcesSection, SummaryCard } from "../components/election-parts.tsx";
import { forceSlug, PartySheet } from "../components/party-sheet.tsx";
import { positives, ResultBars, TurnoutTiles } from "../components/results.tsx";
import { DepartmentMap, type LegendItem, type Paint } from "../components/winner-map.tsx";
import { contenders, forcesOf, shade } from "../contenders.ts";
import { electionTypeLabel, formatDate, formatPercent, officeLabel } from "../labels.ts";
import { officesIn } from "../scope.ts";
import type { SetSearch, YearSearch } from "../search.ts";
import { slug } from "../slug.ts";
import type { Election, ElectionSummary, MapData, Scrutiny, Unit } from "../types.ts";
import { useJson, useJsonAll } from "../use-json.ts";

const ALL = "todos";
const OTHER = "var(--color-chart-axis)";

/** The definitive scrutiny when there is one: it is the one that counts. */
const mainScrutiny = (e: Election): Scrutiny => (e.escrutinios.definitivo ? "definitivo" : "provisorio");

/** One election day of a municipality: the election and the municipal offices it voted that day. */
interface Vote {
  election: Election;
  offices: string[];
}

/** Every municipality that voted municipal offices in the year, with its election days in date order. */
function municipalities(elections: Election[]): Map<string, Vote[]> {
  const out = new Map<string, Vote[]>();
  for (const election of elections) {
    const byTown = new Map<string, string[]>();
    for (const scrutiny of Object.values(election.escrutinios))
      for (const office of officesIn(Object.keys(scrutiny.cargos), "municipal"))
        for (const d of scrutiny.cargos[office]!.departamentos)
          if (!byTown.get(d.nombre)?.includes(office)) byTown.set(d.nombre, [...(byTown.get(d.nombre) ?? []), office]);
    for (const [town, offices] of byTown) out.set(town, [...(out.get(town) ?? []), { election, offices }]);
  }
  return new Map([...out].sort(([a], [b]) => a.localeCompare(b, "es")));
}

/** What a municipality decided in the year: the winner of its main office on its last day that was not a primary. */
function headline(town: string, votes: Vote[]) {
  const vote = votes.filter((v) => v.election.tipo !== "paso").at(-1) ?? votes.at(-1)!;
  const office = vote.offices[0]!;
  const unit = vote.election.escrutinios[mainScrutiny(vote.election)]?.cargos[office]?.departamentos.find((d) => d.nombre === town);
  const first = unit ? forcesOf(unit)[0] : undefined;
  if (!unit || !first) return null;
  const total = positives(unit);
  return { election: vote.election, office, winner: first, total, share: first.votos / total };
}

/**
 * Municipal offices (mayor, councillors): each municipality holds its own election, with its own lists, sometimes on
 * its own date. So nothing is added up across the province: first you pick the municipality (map or list), then
 * its result, with the two forces that led there.
 */
export function MunicipalView({
  year,
  summaries,
  search,
  set,
}: {
  year: string;
  summaries: ElectionSummary[];
  search: YearSearch;
  set: SetSearch;
}) {
  const all = useJsonAll<Election>(summaries.map((s) => `/datos/elecciones/${s.id}.json`));
  if (all.status === "loading") return <Skeleton className="h-96 w-full" />;
  if (all.status === "error") return <Message title="No pudimos cargar estas elecciones">Probá recargar la página.</Message>;
  const towns = municipalities(all.data);
  const name = [...towns.keys()].find((t) => slug(t) === search.municipio);
  const picker = (
    <div className="w-full max-w-sm">
      <SearchSelect
        label="Municipio"
        placeholder="Buscá tu municipio"
        value={name ? slug(name) : ALL}
        onChange={(m) => set({ municipio: m === ALL ? undefined : m, eleccion: undefined, cargo: undefined, partido: undefined })}
        items={[{ id: ALL, label: "Todos los municipios" }, ...[...towns.keys()].map((t) => ({ id: slug(t), label: t }))]}
      />
    </div>
  );
  return name ? (
    <TownView town={name} votes={towns.get(name)!} search={search} set={set} picker={picker} />
  ) : (
    <Overview year={year} towns={towns} set={set} picker={picker} />
  );
}

function Overview({ year, towns, set, picker }: { year: string; towns: Map<string, Vote[]>; set: SetSearch; picker: ReactNode }) {
  const map = useJson<MapData>("/datos/mapa.json");
  const results = new Map([...towns].map(([t, v]) => [t, headline(t, v)]));
  const open = (town: string | null) => set({ municipio: town ? slug(town) : undefined });
  const paint = (town: string): Paint | null => {
    const r = results.get(town);
    if (!r) return null;
    const color = r.election.colores[r.winner.agrupacion];
    return {
      fill: color ? shade(color, r.share) : OTHER,
      label: `ganó ${r.winner.agrupacion} ${formatPercent(r.winner.votos, r.total)}`,
    };
  };
  const legend: LegendItem[] = [];
  for (const r of results.values()) {
    const color = r?.election.colores[r.winner.agrupacion];
    if (r && color && !legend.some((l) => l.label === r.winner.agrupacion))
      legend.push({ label: r.winner.agrupacion, style: { backgroundColor: color } });
  }
  if ([...results.values()].some((r) => r && !r.election.colores[r.winner.agrupacion]))
    legend.push({ label: "Fuerza sin color oficial", style: { backgroundColor: OTHER } });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <p className="max-w-3xl text-body-regular text-text-secondary text-pretty">
          En {year} {towns.size === 1 ? "votó 1 municipio" : `votaron ${towns.size} municipios`}. Cada uno elige a su intendente y a su
          Concejo Deliberante por separado, con sus propias listas: por eso no se suman entre sí. Elegí el tuyo.
        </p>
        {picker}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-2">
        {map.status === "ready" ? (
          <Section id="mapa" title="Quién ganó en cada municipio">
            <DepartmentMap
              map={map.data}
              paint={paint}
              selected={null}
              onSelect={open}
              noVote={`no votó cargos municipales en ${year}`}
              legend={legend}
              extra={towns.size < map.data.departamentos.length ? `No votó en ${year}` : undefined}
              shading="Más oscuro, más votos para quien ganó"
            />
          </Section>
        ) : (
          <Skeleton className="h-96 w-full" />
        )}
        <Section id="municipios" title="Municipios">
          <ul className={listVariants()}>
            {[...towns.keys()].map((town) => {
              const r = results.get(town);
              return (
                <li key={town}>
                  <button type="button" className={listRowVariants()} onClick={() => open(town)}>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body-medium text-text-link">{town}</span>
                      {r ? (
                        <>
                          <span className="flex min-w-0 gap-1 text-caption-1-regular text-text-secondary">
                            <span className="truncate">Ganó {r.winner.agrupacion}</span>
                            <span className="shrink-0 tabular-nums">· {formatPercent(r.winner.votos, r.total)}</span>
                          </span>
                          <span className="truncate text-caption-1-regular text-text-tertiary">
                            {officeLabel(r.office)} · {formatDate(r.election.id)}
                          </span>
                        </>
                      ) : (
                        <span className="text-caption-1-regular text-text-secondary">Sin votos positivos</span>
                      )}
                    </span>
                    <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      </div>
    </div>
  );
}

/** One municipality: its election days of the year, its offices, and only its own lists. */
function TownView({
  town,
  votes,
  search,
  set,
  picker,
}: {
  town: string;
  votes: Vote[];
  search: YearSearch;
  set: SetSearch;
  picker: ReactNode;
}) {
  const vote = votes.find((v) => v.election.id === search.eleccion) ?? votes.at(-1)!;
  const { election } = vote;
  const scrutinies = (["provisorio", "definitivo"] as const).filter((s) =>
    vote.offices.some((o) => election.escrutinios[s]?.cargos[o]?.departamentos.some((d) => d.nombre === town)),
  );
  const scrutiny: Scrutiny = scrutinies.find((s) => s === search.escrutinio) ?? scrutinies.at(-1)!;
  const data = election.escrutinios[scrutiny]!;
  const offices = vote.offices.filter((o) => data.cargos[o]?.departamentos.some((d) => d.nombre === town));
  const office = offices.includes(search.cargo ?? "") ? search.cargo! : offices[0]!;
  const results = data.cargos[office]!;
  const unit: Unit = results.departamentos.find((d) => d.nombre === town)!;
  // The two leading forces of this municipality, not of the province: the lists are its own.
  const forces = contenders(unit, election.colores);
  const pick = (l: Parameters<typeof forceSlug>[0]) => set({ partido: forceSlug(l) });

  return (
    <div className="flex flex-col gap-8">
      <Selectors
        elections={votes.map((v) => ({ id: v.election.id, tipo: v.election.tipo }))}
        election={election.id}
        onElection={(id) => set({ eleccion: id, cargo: undefined, partido: undefined })}
        offices={offices}
        office={office}
        onOffice={(c) => set({ cargo: c, partido: undefined })}
        scrutinies={scrutinies}
        scrutiny={scrutiny}
        onScrutiny={(s) => set({ escrutinio: s })}
      >
        {picker}
      </Selectors>
      {votes.length === 1 && (
        <p className="-mt-6 text-caption-1-regular text-text-secondary">
          {town} votó el {formatDate(election.id)} ({electionTypeLabel(election.tipo).toLowerCase()}).
        </p>
      )}

      {forces ? (
        <SummaryCard office={office} place={town} election={election} scrutiny={scrutiny} unit={unit} forces={forces} onPick={pick} />
      ) : (
        <Message title="Sin votos positivos">La fuente no trae votos a listas para este cargo en {town}.</Message>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-2">
        <Section id="resultados" title={`Las listas de ${town}`}>
          <ResultBars unit={unit} forces={forces} colors={election.colores} parties={election.partidos} onPick={pick} />
        </Section>
        <TurnoutTiles unit={unit} />
      </div>

      {results.detalle.includes(slug(town)) && (
        <DepartmentDetailView forces={forces} path={`/datos/elecciones/${election.id}/${scrutiny}/${office}/${slug(town)}.json`} />
      )}

      <AuditSection checks={election.auditoria.filter((c) => c.cargo === office)} place={town} />
      <SourcesSection data={data} />

      {search.partido && (
        <PartySheet
          forceId={search.partido}
          election={election}
          data={data}
          office={office}
          scope="municipal"
          unit={unit}
          place={town}
          forces={forces}
          onClose={() => set({ partido: undefined })}
        />
      )}
    </div>
  );
}
