import { SearchSelect } from "@mt/ui/components/search-select";
import { Section } from "@mt/ui/components/section";
import { AuditSection, DepartmentDetailView, Message, Selectors, SourcesSection, SummaryCard } from "../components/election-parts.tsx";
import { forceSlug, PartySheet } from "../components/party-sheet.tsx";
import { ResultBars, TurnoutTiles } from "../components/results.tsx";
import { UnitList } from "../components/units.tsx";
import { WinnerMap } from "../components/winner-map.tsx";
import { contenders } from "../contenders.ts";
import { officesIn } from "../scope.ts";
import type { SetSearch, YearSearch } from "../search.ts";
import { slug } from "../slug.ts";
import type { Election, ElectionSummary, MapData, Scrutiny } from "../types.ts";
import { useJson } from "../use-json.ts";

const PROVINCE = "provincia";

/**
 * Provincial offices of one election (governor, senators, representatives): the same lists in the whole province.
 * The province first, with the map; a department opens its own figures and its circuits and polling tables.
 */
export function ProvincialView({
  election,
  options,
  search,
  set,
}: {
  election: Election;
  options: ElectionSummary[];
  search: YearSearch;
  set: SetSearch;
}) {
  const map = useJson<MapData>("/datos/mapa.json");

  // In the order they happen (provisional, then definitive), but the definitive one opens first: it is the one that counts.
  const scrutinies = (["provisorio", "definitivo"] as const).filter((s) => election.escrutinios[s]);
  const scrutiny: Scrutiny = scrutinies.find((s) => s === search.escrutinio) ?? scrutinies.at(-1)!;
  const data = election.escrutinios[scrutiny]!;
  const offices = officesIn(Object.keys(data.cargos), "provincial");
  const office = offices.includes(search.cargo ?? "") ? search.cargo! : offices[0]!;
  const results = data.cargos[office]!;
  const department = results.departamentos.find((d) => slug(d.nombre) === search.departamento);
  const unit = department ?? results.provincia;
  // The two colors always follow the two leading forces of the province, also inside a department.
  const forces = contenders(results.provincia ?? results.departamentos[0] ?? null, election.colores);
  const checks = election.auditoria.filter((c) => c.cargo === office);
  const selectDepartment = (name: string | null) => set({ departamento: name ? slug(name) : undefined });
  const place = department ? department.nombre : "toda la provincia";
  const pick = (l: Parameters<typeof forceSlug>[0]) => set({ partido: forceSlug(l) });

  return (
    <div className="flex flex-col gap-8">
      <Selectors
        elections={options}
        election={election.id}
        onElection={(id) => set({ eleccion: id, cargo: undefined, departamento: undefined, partido: undefined })}
        offices={offices}
        office={office}
        onOffice={(c) => set({ cargo: c, partido: undefined })}
        scrutinies={scrutinies}
        scrutiny={scrutiny}
        onScrutiny={(s) => set({ escrutinio: s })}
      >
        {results.departamentos.length > 0 && (
          <div className="w-full max-w-sm">
            <SearchSelect
              label="Departamento"
              placeholder="Buscá un departamento"
              value={department ? slug(department.nombre) : PROVINCE}
              onChange={(d) => set({ departamento: d === PROVINCE ? undefined : d })}
              items={[
                { id: PROVINCE, label: "Toda la provincia" },
                ...results.departamentos.map((d) => ({ id: slug(d.nombre), label: d.nombre })),
              ]}
            />
          </div>
        )}
      </Selectors>

      {unit && forces ? (
        <SummaryCard office={office} place={place} election={election} scrutiny={scrutiny} unit={unit} forces={forces} onPick={pick} />
      ) : (
        <Message title="Sin total para este cargo">La fuente no trae un total para este cargo.</Message>
      )}

      {unit && (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-2">
          {map.status === "ready" && forces && results.departamentos.length > 1 ? (
            <Section id="mapa" title="Quién ganó en cada departamento">
              <WinnerMap
                map={map.data}
                departments={results.departamentos}
                forces={forces}
                selected={department?.nombre ?? null}
                onSelect={selectDepartment}
              />
            </Section>
          ) : null}
          <div className="flex min-w-0 flex-col gap-8 only:col-span-full">
            <TurnoutTiles unit={unit} />
            <Section id="resultados" title="Todas las listas">
              <ResultBars
                unit={unit}
                forces={forces}
                colors={election.colores}
                parties={election.partidos}
                onPick={pick}
                departments={results.departamentos}
              />
            </Section>
          </div>
        </div>
      )}

      {!department && results.departamentos.length > 0 && (
        <Section id="departamentos" title="Por departamento">
          <UnitList units={results.departamentos} forces={forces} onSelect={(d) => selectDepartment(d.nombre)} />
        </Section>
      )}
      {!department && results.secciones.length > 0 && (
        <Section id="secciones" title="Por sección electoral">
          <UnitList units={results.secciones} forces={forces} />
        </Section>
      )}
      {department && results.detalle.includes(slug(department.nombre)) && (
        <DepartmentDetailView
          forces={forces}
          path={`/datos/elecciones/${election.id}/${scrutiny}/${office}/${slug(department.nombre)}.json`}
        />
      )}

      <AuditSection checks={checks} place={department?.nombre} />
      <SourcesSection data={data} />

      {search.partido && unit && (
        <PartySheet
          forceId={search.partido}
          election={election}
          data={data}
          office={office}
          scope="provincial"
          unit={unit}
          place={place}
          forces={forces}
          onClose={() => set({ partido: undefined })}
        />
      )}
    </div>
  );
}
