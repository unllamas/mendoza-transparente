import { listRowVariants, listVariants, tileVariants } from "@mt/ui/components/card";
import { Section } from "@mt/ui/components/section";
import { Segmented } from "@mt/ui/components/segmented";
import { Skeleton } from "@mt/ui/components/skeleton";
import { cx } from "@mt/ui/lib/cx";
import { RiExternalLinkLine } from "@remixicon/react";
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

/** Pick the election day, the office and the scrutiny; one line below says what the office and the scrutiny are. */
export function Selectors({
  elections,
  election,
  onElection,
  offices,
  office,
  onOffice,
  scrutinies,
  scrutiny,
  onScrutiny,
  children,
}: {
  elections: { id: string; tipo: string }[];
  election: string;
  onElection: (id: string) => void;
  offices: string[];
  office: string;
  onOffice: (o: string) => void;
  scrutinies: Scrutiny[];
  scrutiny: Scrutiny;
  onScrutiny: (s: Scrutiny) => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      {elections.length > 1 && (
        <Segmented
          label="Elección"
          value={election}
          onChange={onElection}
          options={elections.map((o) => ({ value: o.id, label: `${electionTypeLabel(o.tipo)} · ${formatDate(o.id)}` }))}
        />
      )}
      <div className="flex flex-wrap items-end gap-3">
        {offices.length > 1 && (
          <Segmented label="Cargo" value={office} onChange={onOffice} options={offices.map((c) => ({ value: c, label: officeLabel(c) }))} />
        )}
        {scrutinies.length > 1 && (
          <Segmented
            label="Escrutinio"
            value={scrutiny}
            onChange={onScrutiny}
            options={scrutinies.map((s) => ({ value: s, label: SCRUTINY_LABEL[s] }))}
          />
        )}
      </div>
      <p className="max-w-3xl text-caption-1-regular text-text-secondary text-pretty">
        {OFFICE_HINT[office]} {SCRUTINY_HINT[scrutiny]}
      </p>
      {children}
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
