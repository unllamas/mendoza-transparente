import { Select, SelectItem } from "@mt/ui/components/base/select/select";
import { listRowVariants, listVariants, tileVariants } from "@mt/ui/components/card";
import { Section } from "@mt/ui/components/section";
import { Skeleton } from "@mt/ui/components/skeleton";
import { cx } from "@mt/ui/lib/cx";
import { RiErrorWarningLine, RiExternalLinkLine } from "@remixicon/react";
import type { ReactNode } from "react";
import type { Contenders, Force } from "../contenders.ts";
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
import type { AuditCheck, DepartmentDetail, Election, ElectionScrutiny, Scrutiny, Unit } from "../types.ts";
import { useJson } from "../use-json.ts";
import { AuditList } from "./audit.tsx";
import { HeadToHead } from "./head-to-head.tsx";
import { UnitList } from "./units.tsx";

/**
 * Every filter of a year page in one grid that never changes shape: year, kind, place, election day, office and
 * scrutiny are always there, in the same place, whatever the year or the municipality. What does not apply shows
 * disabled instead of disappearing, and the line below says why. One row on a computer.
 */
export function FilterBar({ children, note, hint }: { children: ReactNode; note?: string; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-3 lg:grid-cols-[minmax(0,0.6fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
        {children}
      </div>
      {/* Room for a warning and two lines of explanation, so the page below does not move between years. */}
      <div className="flex max-w-3xl flex-col gap-1 text-caption-1-regular text-text-secondary text-pretty sm:min-h-14">
        {note && (
          <p className="flex items-start gap-1.5 text-text-primary">
            <RiErrorWarningLine className="size-4 shrink-0 text-warning-foreground" aria-hidden />
            {note}
          </p>
        )}
        {hint && <p>{hint}</p>}
      </div>
    </div>
  );
}

/** The place filter (municipality or department) takes the whole width on phones: the names are long. */
export const PLACE_CELL = "col-span-2 min-w-0 sm:col-span-1";

export type FilterOption = { id: string; label: string; disabled?: boolean };

/** One filter of the bar. With a single option (or none, while it does not apply) it shows disabled. */
export function FilterSelect({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: FilterOption[];
  value?: string;
  onChange?: (id: string) => void;
  className?: string;
}) {
  return (
    <Select
      label={label}
      placeholder="—"
      selectedKey={value ?? null}
      onSelectionChange={(key) => key != null && onChange?.(String(key))}
      isDisabled={!onChange || options.filter((o) => !o.disabled).length < 2}
      className={cx("min-w-0", className)}
      triggerClassName="w-full"
    >
      {options.map((o) => (
        <SelectItem key={o.id} id={o.id} isDisabled={o.disabled}>
          {o.label}
        </SelectItem>
      ))}
    </Select>
  );
}

/** Election day, office and scrutiny. Without data (the province while it loads, no municipality chosen) they show disabled. */
export function ResultFilters({
  elections = [],
  election,
  onElection,
  offices = [],
  office,
  onOffice,
  scrutinies = [],
  scrutiny,
  onScrutiny,
}: {
  elections?: { id: string; tipo: string }[];
  election?: string;
  onElection?: (id: string) => void;
  offices?: string[];
  office?: string;
  onOffice?: (o: string) => void;
  scrutinies?: Scrutiny[];
  scrutiny?: Scrutiny;
  onScrutiny?: (s: Scrutiny) => void;
}) {
  return (
    <>
      <FilterSelect
        label="Fecha"
        className="col-span-2 sm:col-span-1"
        value={election}
        onChange={onElection}
        options={elections.map((o) => ({ id: o.id, label: `${electionTypeLabel(o.tipo)} · ${formatDate(o.id)}` }))}
      />
      <FilterSelect label="Cargo" value={office} onChange={onOffice} options={offices.map((c) => ({ id: c, label: officeLabel(c) }))} />
      <FilterSelect
        label="Escrutinio"
        value={scrutiny}
        onChange={onScrutiny && ((s) => onScrutiny(s as Scrutiny))}
        options={scrutinies.map((s) => ({ id: s, label: SCRUTINY_LABEL[s] }))}
      />
    </>
  );
}

/** What the office and the scrutiny on screen are, in one or two lines below the filters. */
export const resultHint = (office: string, scrutiny: Scrutiny) => `${OFFICE_HINT[office] ?? ""} ${SCRUTINY_HINT[scrutiny]}`.trim();

/** The bar with everything below the year and the kind disabled, and the space of the results, while they load. */
export function PendingFilters({ lead, note, place }: { lead: ReactNode; note?: string; place: string }) {
  return (
    <div className="flex flex-col gap-8">
      <FilterBar note={note}>
        {lead}
        <FilterSelect label={place} options={[]} className={PLACE_CELL} />
        <ResultFilters />
      </FilterBar>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

/** The result in one card: office and place, and the two leading forces face to face. */
export function SummaryCard({
  office,
  place,
  election,
  scrutiny,
  unit,
  forces,
  onPick,
}: {
  office: string;
  place: string;
  election: Election;
  scrutiny: Scrutiny;
  unit: Unit;
  forces: Contenders;
  onPick: (f: Force) => void;
}) {
  return (
    <section aria-labelledby="resumen" className={cx(tileVariants({ size: "lg" }), "flex flex-col gap-4")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="resumen" className="text-title-3-semibold text-text-primary">
          {officeLabel(office)} · {place}
        </h2>
        <span className="text-caption-1-regular text-text-secondary">
          {electionTypeLabel(election.tipo)} del {formatDate(election.id)} · escrutinio {scrutiny}
        </span>
      </div>
      <HeadToHead unit={unit} forces={forces} colors={election.colores} parties={election.partidos} onPick={onPick} />
    </section>
  );
}

export function AuditSection({ checks, place }: { checks: AuditCheck[]; place?: string }) {
  const alerts = checks.reduce((s, c) => s + (place ? (c.lugares[place]?.alertas ?? 0) : c.alertas), 0);
  return (
    <Section id="auditoria" title={alerts > 0 ? `¿Cierran los números? · ${formatNumber(alerts)} para mirar` : "¿Cierran los números?"}>
      <AuditList checks={checks} place={place} />
    </Section>
  );
}

export function SourcesSection({ data }: { data: ElectionScrutiny }) {
  return (
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
  );
}

export function DepartmentDetailView({ path, forces }: { path: string; forces: Contenders | null }) {
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

export function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h2 className="text-title-2-semibold text-text-primary">{title}</h2>
      <div className="text-body-regular text-text-secondary">{children}</div>
    </div>
  );
}
