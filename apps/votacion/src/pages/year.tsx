import { buttonClassName } from "@mt/ui/components/base/buttons/button";
import { listRowVariants, listVariants, tileVariants } from "@mt/ui/components/card";
import { SearchSelect } from "@mt/ui/components/search-select";
import { PageHeader, Section } from "@mt/ui/components/section";
import { Segmented } from "@mt/ui/components/segmented";
import { Skeleton } from "@mt/ui/components/skeleton";
import { cx } from "@mt/ui/lib/cx";
import { RiExternalLinkLine } from "@remixicon/react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AuditList } from "../components/audit.tsx";
import { HeadToHead } from "../components/head-to-head.tsx";
import { ResultBars, TurnoutTiles } from "../components/results.tsx";
import { UnitList } from "../components/units.tsx";
import { WinnerMap } from "../components/winner-map.tsx";
import { type Contenders, contenders } from "../contenders.ts";
import {
  electionTypeLabel,
  formatDate,
  formatNumber,
  OFFICE_HINT,
  officeLabel,
  SCRUTINY_HINT,
  SCRUTINY_LABEL,
  SOURCE_LABEL,
} from "../labels.ts";
import { slug } from "../slug.ts";
import type { DataIndex, DepartmentDetail, Election, MapData, Scrutiny } from "../types.ts";
import { useJson } from "../use-json.ts";

export interface YearSearch {
  eleccion?: string;
  escrutinio?: string;
  cargo?: string;
  departamento?: string;
}

const PROVINCE = "provincia";

/** Every election of one year: pick the election day, the scrutiny and the office; the department opens its detail. */
export function YearPage({ year, search }: { year: string; search: YearSearch }) {
  const index = useJson<DataIndex>("/datos/indice.json");
  const entry = index.status === "ready" ? index.data.anios.find((a) => String(a.anio) === year) : undefined;
  const summary = entry?.elecciones.find((e) => e.id === search.eleccion) ?? entry?.elecciones.at(-1);
  const election = useJson<Election>(summary ? `/datos/elecciones/${summary.id}.json` : null);

  if (index.status === "loading") return <PageSkeleton />;
  if (index.status === "error")
    return (
      <Shell>
        <Message title="No pudimos cargar los datos">Probá recargar la página.</Message>
      </Shell>
    );
  if (!entry || !summary)
    return (
      <Shell>
        <Message title={`No tenemos elecciones de ${year}`}>Elegí uno de los años con datos:</Message>
        <YearLinks years={index.data.anios.map((a) => a.anio)} />
      </Shell>
    );

  return (
    <Shell>
      <PageHeader title={`Elecciones de ${year}`}>
        Resultados de las elecciones provinciales de Mendoza en {year}, según las fuentes oficiales.
      </PageHeader>
      <YearLinks years={index.data.anios.map((a) => a.anio)} current={Number(year)} />
      {election.status === "ready" ? (
        <ElectionView year={year} election={election.data} search={search} options={entry.elecciones} />
      ) : election.status === "error" ? (
        <Message title="No pudimos cargar esta elección">Probá recargar la página.</Message>
      ) : (
        <Skeleton className="h-96 w-full" />
      )}
    </Shell>
  );
}

function ElectionView({
  year,
  election,
  search,
  options,
}: {
  year: string;
  election: Election;
  search: YearSearch;
  options: DataIndex["anios"][number]["elecciones"];
}) {
  const navigate = useNavigate();
  const map = useJson<MapData>("/datos/mapa.json");
  const set = (patch: Partial<YearSearch>) =>
    navigate({ to: "/$anio", params: { anio: year }, search: (prev: YearSearch) => ({ ...prev, ...patch }), replace: true });

  // In the order they happen (provisional, then definitive), but the definitive one opens first: it is the one that counts.
  const scrutinies = (["provisorio", "definitivo"] as const).filter((s) => election.escrutinios[s]);
  const scrutiny: Scrutiny = scrutinies.find((s) => s === search.escrutinio) ?? scrutinies.at(-1)!;
  const data = election.escrutinios[scrutiny]!;
  const offices = Object.keys(data.cargos);
  const office = offices.includes(search.cargo ?? "") ? search.cargo! : offices[0]!;
  const results = data.cargos[office]!;
  const department = results.departamentos.find((d) => slug(d.nombre) === search.departamento);
  const unit = department ?? results.provincia;
  // The two colors always follow the two leading forces of the province, also inside a department.
  const forces = contenders(results.provincia ?? results.departamentos[0] ?? null, election.colores);
  const checks = election.auditoria.filter((c) => c.cargo === office);
  const alerts = checks.reduce((s, c) => s + c.alertas, 0);
  // A municipal province total added up from separate local elections: a head-to-head over it compares lists that
  // never ran against each other.
  const localOnly = !department && election.tipo === "municipal" && !!results.provincia?.sumado;
  const selectDepartment = (name: string | null) => set({ departamento: name ? slug(name) : undefined });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        {options.length > 1 && (
          <Segmented
            label="Elección"
            value={election.id}
            onChange={(id) => set({ eleccion: id, cargo: undefined, departamento: undefined })}
            options={options.map((o) => ({ value: o.id, label: `${electionTypeLabel(o.tipo)} · ${formatDate(o.id)}` }))}
          />
        )}
        <div className="flex flex-wrap items-end gap-3">
          <Segmented
            label="Cargo"
            value={office}
            onChange={(c) => set({ cargo: c })}
            options={offices.map((c) => ({ value: c, label: officeLabel(c) }))}
          />
          {scrutinies.length > 1 && (
            <Segmented
              label="Escrutinio"
              value={scrutiny}
              onChange={(s) => set({ escrutinio: s })}
              options={scrutinies.map((s) => ({ value: s, label: SCRUTINY_LABEL[s] }))}
            />
          )}
        </div>
        <p className="max-w-3xl text-caption-1-regular text-text-secondary text-pretty">
          {OFFICE_HINT[office]} {SCRUTINY_HINT[scrutiny]}
        </p>
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
      </div>

      {unit && forces ? (
        <section aria-labelledby="resumen" className={cx(tileVariants({ size: "lg" }), "flex flex-col gap-4")}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="resumen" className="text-title-3-semibold text-text-primary">
              {officeLabel(office)} · {department ? department.nombre : "toda la provincia"}
            </h2>
            <span className="text-caption-1-regular text-text-secondary">
              {electionTypeLabel(election.tipo)} del {formatDate(election.id)} · escrutinio {scrutiny}
            </span>
          </div>
          {localOnly ? (
            <p className="text-body-regular text-text-secondary text-pretty">
              Cada departamento eligió a sus {officeLabel(office).toLowerCase()} por separado, con sus propias listas: el total de la
              provincia es una suma nuestra y no enfrenta a nadie. Elegí un departamento para ver quién ganó y por cuánto.
            </p>
          ) : (
            <HeadToHead unit={unit} forces={forces} />
          )}
        </section>
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
              <ResultBars unit={unit} forces={forces} departments={results.departamentos} />
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

      <Section
        id="auditoria"
        title={alerts > 0 ? `Auditoría · ${formatNumber(alerts)} ${alerts === 1 ? "alerta" : "alertas"}` : "Auditoría"}
      >
        <AuditList checks={checks} />
      </Section>

      <Section id="fuentes" title="Fuentes">
        <ul className={listVariants()}>
          <li>
            <a href={data.fuenteUrl} target="_blank" rel="noreferrer" className={listRowVariants()}>
              <span className="min-w-0 flex-1 truncate text-body-medium text-text-link">{SOURCE_LABEL[data.fuente] ?? data.fuente}</span>
              <RiExternalLinkLine className="size-4 shrink-0 text-text-link" aria-hidden />
            </a>
          </li>
        </ul>
      </Section>
    </div>
  );
}

function DepartmentDetailView({ path, forces }: { path: string; forces: Contenders | null }) {
  const detail = useJson<DepartmentDetail>(path);
  if (detail.status === "loading") return <Skeleton className="h-64 w-full" />;
  if (detail.status === "error") return <Message title="No pudimos cargar el detalle">Probá recargar la página.</Message>;
  return (
    <>
      {detail.data.circuitos.length > 0 && (
        <Section id="circuitos" title="Por circuito">
          <UnitList units={detail.data.circuitos} forces={forces} />
        </Section>
      )}
      {detail.data.mesas.length > 0 && (
        <Section id="mesas" title="Por mesa">
          <UnitList units={detail.data.mesas} limit={20} forces={forces} />
        </Section>
      )}
    </>
  );
}

function YearLinks({ years, current }: { years: number[]; current?: number }) {
  return (
    <nav aria-label="Años" className="flex flex-wrap gap-2">
      {years.map((y) => (
        <Link
          key={y}
          to="/$anio"
          params={{ anio: String(y) }}
          search={{}}
          aria-current={y === current ? "page" : undefined}
          className={cx(buttonClassName({ variant: y === current ? "primary" : "secondary" }), "tabular-nums")}
        >
          {y}
        </Link>
      ))}
    </nav>
  );
}

function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h2 className="text-title-2-semibold text-text-primary">{title}</h2>
      <div className="text-body-regular text-text-secondary">{children}</div>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">{children}</main>;
}

function PageSkeleton() {
  return (
    <Shell>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-96 w-full" />
    </Shell>
  );
}
