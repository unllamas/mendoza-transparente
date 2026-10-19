import { PersonAvatar } from "@mt/ui/components/avatar";
import { Select, SelectItem } from "@mt/ui/components/base/select/select";
import { listRowVariants, listVariants } from "@mt/ui/components/card";
import { PageHeader, Section } from "@mt/ui/components/section";
import { RiArrowRightSLine, RiHistoryLine } from "@remixicon/react";
import { getRouteApi, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";

import { BarList } from "@/charts/bar-list.tsx";
import { WithBreadcrumbs } from "@/components/breadcrumbs.tsx";
import { ListSearch } from "@/components/list-search.tsx";
import { FuentesOficiales } from "@/components/official-sources.tsx";
import { ShareButton } from "@/components/share-button.tsx";
import { TrackedSheet } from "@/components/tracked-sheet.tsx";
import { Career } from "@/features/officials/components/career.tsx";
import { formatDate, formatNumber, normalizeText } from "@/lib.ts";
import type { ElectionSummary, HistoryPerson } from "@/types.ts";
import { useUrlOption, useUrlText } from "@/url-state.ts";

const route = getRouteApi("/funcionarios/historial");

/** Without a search, the list shows who left most recently; a search goes through everyone. */
const RECENT = 30;
const MAX_RESULTS = 100;

const years = (p: HistoryPerson) => (p.from && p.to && p.from !== p.to ? `${p.from}–${p.to}` : (p.to ?? p.from ?? ""));

/** `/funcionarios/historial`: who governed and for which party since 2015, and who held each position before. */
export function HistoryPage() {
  const { people, elections, formerCount } = route.useLoaderData();
  const router = useRouter();
  // The open person lives in the URL (?persona=<id>): shareable, findable from the search, and "back" closes it.
  const search = useRouterState({ select: (st) => st.location.search as Record<string, unknown> });
  const open = people.find((p) => p.id === search.persona) ?? null;
  const setOpen = (p: HistoryPerson | null) => {
    const url = new URL(window.location.href);
    if (p) url.searchParams.set("persona", p.id);
    else url.searchParams.delete("persona");
    void router.navigate({ href: `${url.pathname}${url.search}`, replace: !p, resetScroll: false });
  };

  return (
    <div className="flex flex-col gap-10">
      <WithBreadcrumbs items={[{ label: "Funcionarios", to: "/funcionarios" }]} current={{ label: "Historial", icon: RiHistoryLine }}>
        <PageHeader action={<ShareButton />} title="¿Quién ocupó cada cargo?">
          Quiénes ganaron cada elección desde 2015 y por qué partido
          {formerCount > 0 ? `, y ${formatNumber(formerCount)} ex funcionarios con los cargos que ocuparon y sus fechas.` : "."}
        </PageHeader>
      </WithBreadcrumbs>

      <Governors elections={elections} />
      {elections.length > 0 && <Elections elections={elections} />}
      <People people={people} onOpen={setOpen} />

      {open && <PersonSheet person={open} onClose={() => setOpen(null)} />}

      <FuentesOficiales ids={["junta-electoral", "etica-publica"]} />
    </div>
  );
}

/** "/funcionarios/historial?persona=x" → { persona: "x" } (TanStack takes the query apart from the path). */
const searchOf = (href: string) => Object.fromEntries(new URLSearchParams(href.split("?")[1] ?? ""));

function Governors({ elections }: { elections: ElectionSummary[] }) {
  const governors = elections.filter((e) => e.governor);
  if (governors.length === 0) return null;
  return (
    <Section id="gobernadores" title="Gobernadores">
      <ul className={listVariants()}>
        {governors.map((e) => (
          <li key={e.date}>
            <Link to={e.governor!.href.split("?")[0]} search={searchOf(e.governor!.href) as never} className={listRowVariants()}>
              <span className="w-11 shrink-0 text-body-semibold tabular-nums">{e.year}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium text-text-link">{e.governor!.name}</span>
                <span className="truncate text-body-regular text-text-tertiary">{e.governor!.party ?? "El acta no dice el partido"}</span>
              </span>
              <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-caption-1-regular text-text-tertiary">Año de la elección. El mandato empieza en diciembre y dura cuatro años.</p>
    </Section>
  );
}

/** Election label: the year, or the full date when two elections share a year. */
function electionLabel(e: ElectionSummary, all: ElectionSummary[]) {
  return all.filter((x) => x.year === e.year).length > 1 ? formatDate(e.date) : String(e.year);
}

function Elections({ elections }: { elections: ElectionSummary[] }) {
  const dates = elections.map((e) => e.date);
  const [date, setDate] = useUrlOption("eleccion", dates, dates[0]!);
  const e = elections.find((x) => x.date === date)!;
  return (
    <Section id="elecciones" title="Cómo se repartieron los cargos en cada elección">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body-regular text-text-secondary">
          Bancas y cargos que ganó cada partido o frente, según el acta de proclamación.
        </p>
        <Select aria-label="Elección" value={date} onChange={(key) => setDate(String(key))} className="shrink-0 sm:w-48">
          {elections.map((x) => (
            <SelectItem key={x.date} id={x.date}>
              {`Elección ${electionLabel(x, elections)}`}
            </SelectItem>
          ))}
        </Select>
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-2">
        {e.offices.map((o) => (
          <div key={o.key} className="flex flex-col gap-3 only:col-span-full">
            <h3 className="text-body-semibold">
              {o.label} <span className="font-normal text-text-tertiary">· {o.total}</span>
            </h3>
            <BarList items={o.parties} total={o.total} formatValue={(v) => formatNumber(v)} />
          </div>
        ))}
      </div>
      <a href={e.sourceUrl} target="_blank" rel="noreferrer" className="w-fit text-body-regular text-text-link hover:underline">
        Acta de proclamación de la elección {electionLabel(e, elections)} ›
      </a>
    </Section>
  );
}

function People({ people, onOpen }: { people: HistoryPerson[]; onOpen: (p: HistoryPerson) => void }) {
  const [query, setQuery] = useUrlText("q");
  const indexed = useMemo(
    () =>
      people.map((p) => ({
        p,
        text: normalizeText(
          [
            p.name,
            ...p.positions.map((x) => `${x.role} ${x.agency}`),
            ...p.elected.map((x) => `${x.role} ${x.place} ${x.party ?? ""}`),
          ].join(" "),
        ),
      })),
    [people],
  );
  const q = normalizeText(query.trim());
  const words = q.split(/\s+/).filter(Boolean);
  const matches = q ? indexed.filter((x) => words.every((w) => x.text.includes(w))).map((x) => x.p) : people;
  const shown = matches.slice(0, q ? MAX_RESULTS : RECENT);
  return (
    <Section id="personas" title="Ex funcionarios y electos">
      <ListSearch
        value={query}
        onChange={setQuery}
        placeholder="Buscar por nombre, cargo, organismo o partido"
        label="Buscar ex funcionario"
      />
      <p className="text-body-regular text-text-secondary">
        {q
          ? matches.length === 0
            ? "Nadie coincide con esa búsqueda. Probá solo con el apellido."
            : `${formatNumber(matches.length)} ${matches.length === 1 ? "persona" : "personas"}${matches.length > shown.length ? `; se muestran las primeras ${shown.length}` : ""}.`
          : people.some((p) => p.positions.length)
            ? `Primero, quienes dejaron su cargo hace menos tiempo. Buscá entre las ${formatNumber(people.length)} personas, también los electos desde 2015.`
            : `Quienes ganaron una elección desde 2015, de la más reciente a la más vieja. Buscá entre las ${formatNumber(people.length)} personas.`}
      </p>
      {shown.length > 0 && (
        <ul className={listVariants()}>
          {shown.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onOpen(p)} className={listRowVariants()}>
                <PersonAvatar name={p.name} photo={null} className="size-10 text-caption-1-regular" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium text-text-link">{p.name}</span>
                  <span className="truncate text-body-regular text-text-tertiary">
                    {p.role} · {p.agency}
                  </span>
                </span>
                <span className="hidden text-body-regular whitespace-nowrap text-text-tertiary tabular-nums sm:block">{years(p)}</span>
                <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function PersonSheet({ person: p, onClose }: { person: HistoryPerson; onClose: () => void }) {
  return (
    <TrackedSheet title={p.name} trackId="officials.history_person" onClose={onClose}>
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <PersonAvatar name={p.name} photo={null} className="size-14 text-headline-regular" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-title-3-semibold text-balance">{p.name}</span>
            <span className="text-body-regular text-text-secondary">
              {p.role}
              {years(p) && ` · ${years(p)}`}
            </span>
          </div>
        </div>
        <Career positions={p.positions} elected={p.elected} headingLevel="h4" />
      </div>
    </TrackedSheet>
  );
}
