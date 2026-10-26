import { buttonClassName } from "@mt/ui/components/base/buttons/button";
import { PageHeader } from "@mt/ui/components/section";
import { Skeleton } from "@mt/ui/components/skeleton";
import { cx } from "@mt/ui/lib/cx";
import { Link, Navigate, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { FilterSelect, Message, PendingFilters } from "../components/election-parts.tsx";
import { electionsIn, SCOPE_LABEL, type Scope } from "../scope.ts";
import type { SetSearch, YearSearch } from "../search.ts";
import type { DataIndex, Election } from "../types.ts";
import { useJson } from "../use-json.ts";
import { MunicipalView } from "./municipal.tsx";
import { ProvincialView } from "./provincial.tsx";

const ROUTE = { provincial: "/$anio", municipal: "/$anio/municipales" } as const;

/**
 * The elections of one year, in two pages that never mix: provincial offices (`/2023`) and municipal ones
 * (`/2023/municipales`). A year with only one kind sends the other page to it.
 */
export function YearPage({ year, scope, search }: { year: string; scope: Scope; search: YearSearch }) {
  const index = useJson<DataIndex>("/datos/indice.json");
  const navigate = useNavigate();
  const entry = index.status === "ready" ? index.data.anios.find((a) => String(a.anio) === year) : undefined;
  const scoped = entry ? electionsIn(entry.elecciones, scope) : [];
  const other: Scope = scope === "provincial" ? "municipal" : "provincial";
  const summary = scope === "provincial" ? (scoped.find((e) => e.id === search.eleccion) ?? scoped.at(-1)) : undefined;
  const election = useJson<Election>(summary ? `/datos/elecciones/${summary.id}.json` : null);
  const set: SetSearch = (patch) =>
    navigate({ to: ROUTE[scope], params: { anio: year }, search: (prev: YearSearch) => ({ ...prev, ...patch }), replace: true });

  if (index.status === "loading") return <PageSkeleton />;
  if (index.status === "error")
    return (
      <Shell>
        <Message title="No pudimos cargar los datos">Probá recargar la página.</Message>
      </Shell>
    );
  if (!entry)
    return (
      <Shell>
        <Message title={`No tenemos elecciones de ${year}`}>Elegí uno de los años con datos:</Message>
        <YearLinks years={index.data.anios.map((a) => a.anio)} scope={scope} />
      </Shell>
    );
  const scopes = (["provincial", "municipal"] as const).filter((s) => electionsIn(entry.elecciones, s).length > 0);
  if (scoped.length === 0) return <Navigate to={ROUTE[other]} params={{ anio: year }} replace />;

  const lead = (
    <>
      <FilterSelect
        label="Año"
        value={year}
        onChange={(y) => navigate({ to: ROUTE[scope], params: { anio: y }, search: {} })}
        options={index.data.anios.map((a) => ({ id: String(a.anio), label: String(a.anio) }))}
      />
      <FilterSelect
        label="Tipo"
        value={scope}
        onChange={(s) => navigate({ to: ROUTE[s as Scope], params: { anio: year }, search: {} })}
        options={(["provincial", "municipal"] as const).map((s) => ({ id: s, label: SCOPE_LABEL[s], disabled: !scopes.includes(s) }))}
      />
    </>
  );
  // The kind the year did not have stays in the menu, disabled, and this line says why.
  const note = scopes.length > 1 ? undefined : `En ${year} no hubo elecciones ${SCOPE_LABEL[other].toLowerCase()}.`;

  return (
    <Shell>
      <PageHeader title={`Elecciones ${SCOPE_LABEL[scope].toLowerCase()} de ${year}`}>
        {scope === "provincial"
          ? `Gobernador, senadores y diputados de Mendoza en ${year}, según las fuentes oficiales.`
          : "Intendentes, concejales y convencionales de cada municipio, según las fuentes oficiales."}
      </PageHeader>
      {scope === "municipal" ? (
        <MunicipalView year={year} summaries={scoped} search={search} set={set} lead={lead} note={note} />
      ) : election.status === "ready" ? (
        <ProvincialView election={election.data} options={scoped} search={search} set={set} lead={lead} note={note} />
      ) : election.status === "error" ? (
        <Message title="No pudimos cargar esta elección">Probá recargar la página.</Message>
      ) : (
        <PendingFilters lead={lead} note={note} place="Departamento" />
      )}
    </Shell>
  );
}

/** Every year with data; the link keeps the kind of election (the year without it sends to the other one). */
function YearLinks({ years, current, scope }: { years: number[]; current?: number; scope: Scope }) {
  return (
    <nav aria-label="Años" className="flex flex-wrap gap-2">
      {years.map((y) => (
        <Link
          key={y}
          to={ROUTE[scope]}
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
