import { tileVariants } from "@mt/ui/components/card";
import { StatTile } from "@mt/ui/components/stat-tile";
import { cx } from "@mt/ui/lib/cx";
import { type Contenders, sideOf, sideStyle } from "../contenders.ts";
import { formatNumber, formatPercent, VOTE_TYPE_LABEL } from "../labels.ts";
import type { Unit, VoteType } from "../types.ts";

export const positives = (u: Unit) => u.listas.reduce((s, l) => s + l.votos, 0);

/** Turnout figures of a unit: voters over the electoral roll, and polling tables counted. */
export function TurnoutTiles({ unit }: { unit: Unit }) {
  const p = unit.participacion;
  const emitted = positives(unit) + Object.values(unit.otros).reduce((s, v) => s + (v ?? 0), 0);
  return (
    <div className="grid grid-cols-2 gap-3">
      <StatTile label="Votos positivos" value={formatNumber(positives(unit))} note={`de ${formatNumber(emitted)} emitidos`} />
      {p?.votantes != null && p.electores != null ? (
        <StatTile
          label="Participación"
          value={formatPercent(p.votantes, p.electores)}
          note={`${formatNumber(p.votantes)} de ${formatNumber(p.electores)} electores`}
        />
      ) : (
        <StatTile label="Participación" value="–" note="La fuente no la informa" />
      )}
      {p?.mesasEscrutadas != null && p.mesasHabilitadas != null ? (
        <StatTile
          label="Mesas escrutadas"
          value={formatPercent(p.mesasEscrutadas, p.mesasHabilitadas)}
          note={`${formatNumber(p.mesasEscrutadas)} de ${formatNumber(p.mesasHabilitadas)}`}
        />
      ) : (
        <StatTile label="Mesas escrutadas" value="–" note="La fuente no lo informa" />
      )}
      <StatTile label="Listas" value={formatNumber(unit.listas.length)} />
    </div>
  );
}

/** Votes per list as bars over the positive votes (a composition: the full bar is 100 %), then blank and null votes. */
export function ResultBars({ unit, forces }: { unit: Unit; forces: Contenders | null }) {
  const total = positives(unit);
  const others = (Object.entries(unit.otros) as [VoteType, number][]).filter(([, v]) => v > 0);
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {unit.listas.map((l, i) => (
          <li key={`${l.lista}|${l.agrupacion}`} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-body-regular">
              <span
                className={cx("min-w-0 truncate", i === 0 ? "font-semibold text-text-primary" : "text-text-secondary")}
                title={l.agrupacion}
              >
                {l.lista && <span className="tabular-nums">{l.lista} · </span>}
                {l.agrupacion}
              </span>
              <span className="shrink-0 font-medium whitespace-nowrap tabular-nums">
                {formatPercent(l.votos, total)}
                <span className="ml-2 font-normal text-text-secondary">{formatNumber(l.votos)}</span>
              </span>
            </div>
            {l.candidato && <span className="truncate text-caption-1-regular text-text-secondary">{l.candidato}</span>}
            <div className="h-2 overflow-hidden rounded-full bg-background-action">
              <div
                className="h-full rounded-full"
                style={{ ...sideStyle(forces, sideOf(forces, l)), width: `${total ? (l.votos / total) * 100 : 0}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      {others.length > 0 && (
        <dl className={cx(tileVariants({ size: "sm" }), "flex flex-wrap gap-x-6 gap-y-2 text-body-regular")}>
          {others.map(([k, v]) => (
            <div key={k} className="flex gap-2 whitespace-nowrap">
              <dt className="text-text-secondary">{VOTE_TYPE_LABEL[k] ?? k}</dt>
              <dd className="font-medium tabular-nums">{formatNumber(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {unit.sumado && (
        <p className="text-caption-1-regular text-text-secondary">
          Suma nuestra de las unidades más chicas: la fuente no imprime este total.
        </p>
      )}
    </div>
  );
}
