import { listRowVariants, listVariants, tileVariants } from "@mt/ui/components/card";
import { StatTile } from "@mt/ui/components/stat-tile";
import { cx } from "@mt/ui/lib/cx";
import { RiArrowRightSLine } from "@remixicon/react";
import { type Contenders, forceStyle } from "../contenders.ts";
import { formatNumber, formatPercent, VOTE_TYPE_LABEL } from "../labels.ts";
import type { ListVotes, PartyRef, Unit, VoteType } from "../types.ts";
import { PartyMark } from "./party-mark.tsx";

export const positives = (u: Unit) => u.listas.reduce((s, l) => s + l.votos, 0);

/** Turnout figures of a unit: voters over the electoral roll, and polling tables counted. */
export function TurnoutTiles({ unit }: { unit: Unit }) {
  const p = unit.participacion;
  const emitted = positives(unit) + Object.values(unit.otros).reduce((s, v) => s + (v ?? 0), 0);
  return (
    <div className="grid grid-cols-2 gap-3">
      <StatTile
        label="Votos positivos"
        value={formatNumber(positives(unit))}
        note={`Votos a una lista, de ${formatNumber(emitted)} emitidos (el resto, en blanco o nulos)`}
      />
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

/**
 * Votes per list as bars over the positive votes (a composition: the full bar is 100 %), then blank and null votes.
 * Each row opens the force's sheet. In a total added up from departments, a list that ran in a single department says
 * which one: in a municipal election each department numbers its own ballot, so the same number belongs to different
 * local fronts.
 */
export function ResultBars({
  unit,
  forces,
  colors,
  parties,
  onPick,
  departments = [],
}: {
  unit: Unit;
  forces: Contenders | null;
  colors: Record<string, string>;
  parties: Record<string, PartyRef>;
  onPick: (l: ListVotes) => void;
  departments?: Unit[];
}) {
  const total = positives(unit);
  const homes = new Map<string, string[]>();
  if (unit.sumado)
    for (const d of departments)
      for (const l of d.listas) {
        const k = `${l.lista}|${l.agrupacion}`;
        homes.set(k, [...(homes.get(k) ?? []), d.nombre]);
      }
  const numbers = unit.listas.map((l) => l.lista.trim()).filter(Boolean);
  const repeated = new Set(numbers).size < numbers.length;
  const others = (Object.entries(unit.otros) as [VoteType, number][]).filter(([, v]) => v > 0);
  return (
    <div className="flex flex-col gap-4">
      <ul className={listVariants()}>
        {unit.listas.map((l, i) => {
          const where = homes.get(`${l.lista}|${l.agrupacion}`);
          const note = [l.lista && `Lista ${l.lista}`, l.candidato, where?.length === 1 && `Solo en ${where[0]}`]
            .filter(Boolean)
            .join(" · ");
          const style = forceStyle(forces, colors, l);
          return (
            <li key={`${l.lista}|${l.agrupacion}`}>
              <button type="button" className={listRowVariants()} onClick={() => onPick(l)}>
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="flex items-center justify-between gap-3 text-body-regular">
                    <span className="flex min-w-0 items-center gap-2">
                      <PartyMark party={parties[l.agrupacion]} style={style} />
                      <span className={cx("min-w-0 truncate text-text-link", i === 0 && "font-semibold")} title={l.agrupacion}>
                        {l.agrupacion}
                      </span>
                    </span>
                    <span className="shrink-0 font-medium whitespace-nowrap tabular-nums">
                      {formatPercent(l.votos, total)}
                      <span className="ml-2 font-normal text-text-secondary">{formatNumber(l.votos)}</span>
                    </span>
                  </span>
                  {note && <span className="truncate text-caption-1-regular text-text-secondary">{note}</span>}
                  <span className="h-2 overflow-hidden rounded-full bg-background-action">
                    <span className="block h-full rounded-full" style={{ ...style, width: `${total ? (l.votos / total) * 100 : 0}%` }} />
                  </span>
                </span>
                <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
              </button>
            </li>
          );
        })}
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
          {repeated &&
            " El número de lista lo asigna la Junta Electoral en cada boleta: en una elección municipal, el mismo número puede ser de fuerzas distintas en cada departamento."}
        </p>
      )}
    </div>
  );
}
