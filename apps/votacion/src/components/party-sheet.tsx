import { listRowVariants, listVariants } from "@mt/ui/components/card";
import { Sheet } from "@mt/ui/components/sheet";
import { StatTile } from "@mt/ui/components/stat-tile";
import { RiExternalLinkLine } from "@remixicon/react";
import { type Contenders, type Force, forceKey, forceStyle, forcesOf } from "../contenders.ts";
import { formatNumber, formatPercent, officeLabel } from "../labels.ts";
import { type Scope, scopeOf } from "../scope.ts";
import { slug } from "../slug.ts";
import type { Election, ElectionScrutiny, Unit } from "../types.ts";
import { PartyMark } from "./party-mark.tsx";
import { positives } from "./results.tsx";

/** The `partido` of the URL: a force is its number and its name ("506-la-libertad-avanza-cambia-mendoza"). */
export const forceSlug = (l: { lista: string; agrupacion: string } | Force) => slug("key" in l ? l.key : forceKey(l));

/** "A, B y C". */
const listNames = (names: string[]) => (names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`);

/** How a force did in one unit: votes, share of the positive votes and place. Null if it did not run there. */
function standing(u: Unit, key: string) {
  const all = forcesOf(u);
  const i = all.findIndex((f) => slug(f.key) === key);
  if (i < 0) return null;
  const total = positives(u);
  return { force: all[i]!, rank: i + 1, of: all.length, total, share: all[i]!.votos / total };
}

/**
 * One force in the election on screen, in a sheet over the page (the URL keeps it, so it can be shared without a page
 * of its own: the party's page is the main site's, and this links to it). Its votes and place where you are looking,
 * then department by department (provincial offices) or office by office in the municipality (municipal ones).
 */
export function PartySheet({
  forceId,
  election,
  data,
  office,
  scope,
  unit,
  place,
  forces,
  onClose,
}: {
  forceId: string;
  election: Election;
  data: ElectionScrutiny;
  office: string;
  scope: Scope;
  /** The unit on screen: the province, a department or the municipality. */
  unit: Unit;
  place: string;
  forces: Contenders | null;
  onClose: () => void;
}) {
  const here = standing(unit, forceId);
  if (!here) return null;
  const { force } = here;
  const lists = unit.listas.filter((l) => forceSlug(l) === forceId);
  const parties = election.partidos[force.agrupacion] ?? [];
  const style = forceStyle(forces, election.colores, force);
  const numbers = [...new Set(lists.map((l) => l.lista.trim()).filter(Boolean))];
  const candidates = [...new Set(lists.map((l) => l.candidato).filter(Boolean))];

  const rows =
    scope === "provincial"
      ? data.cargos[office]!.departamentos.flatMap((d) => {
          const s = standing(d, forceId);
          return s ? [{ name: d.nombre, ...s }] : [];
        })
      : Object.entries(data.cargos)
          .filter(([o]) => scopeOf(o) === "municipal")
          .flatMap(([o, r]) => {
            const d = r.departamentos.find((x) => x.nombre === unit.nombre);
            const s = d && standing(d, forceId);
            return s ? [{ name: officeLabel(o), ...s }] : [];
          });
  if (scope === "provincial") rows.sort((a, b) => b.share - a.share);

  return (
    <Sheet title={force.agrupacion} onClose={onClose}>
      <div className="flex items-center gap-3">
        <PartyMark parties={parties} style={style} size="lg" />
        <div className="flex min-w-0 flex-col">
          <span className="text-title-3-semibold text-text-primary text-pretty">{force.agrupacion}</span>
          <span className="text-caption-1-regular text-text-secondary text-pretty">
            {[numbers.length > 0 && `${numbers.length === 1 ? "Lista" : "Listas"} ${numbers.join(", ")}`, candidates.slice(0, 3).join(", ")]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Votos"
          value={formatNumber(force.votos)}
          note={`${formatPercent(force.votos, here.total)} de los votos positivos para ${officeLabel(office).toLowerCase()} en ${place}`}
        />
        <StatTile label="Puesto" value={`${here.rank}.º`} note={`De ${here.of} ${here.of === 1 ? "fuerza" : "fuerzas"}`} />
      </div>

      {rows.length > 1 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-headline-medium text-text-primary">{scope === "provincial" ? "Por departamento" : "En cada cargo"}</h3>
          <ul className={listVariants()}>
            {rows.map((r) => (
              <li key={r.name} className={listRowVariants({ interactive: false })}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body-medium text-text-primary">{r.name}</span>
                  <span className="text-caption-1-regular text-text-secondary">
                    {r.rank === 1 ? "Ganó" : `Salió ${r.rank}.º de ${r.of}`}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end text-caption-1-regular whitespace-nowrap text-text-secondary tabular-nums">
                  <span className="text-body-medium text-text-primary">{formatPercent(r.force.votos, r.total)}</span>
                  {formatNumber(r.force.votos)} votos
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {parties.length > 1 && (
        <p className="text-caption-1-regular text-text-secondary text-pretty">
          Es un frente: su nombre oficial reúne a {listNames(parties.map((p) => p.nombre))}. Puede sumar otros partidos que no figuran en el
          nombre.
        </p>
      )}
      {parties.length > 0 ? (
        <ul className={listVariants()}>
          {parties.map((party) => (
            <li key={party.slug}>
              <a
                href={`https://mendoza-transparente.com/partidos/${party.slug}`}
                target="_blank"
                rel="noreferrer"
                className={listRowVariants()}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body-medium text-text-link">Ficha de {party.sigla ?? party.nombre}</span>
                  <span className="text-caption-1-regular text-text-secondary">
                    Quiénes ocupan cargos y sus elecciones, en Mendoza Transparente
                  </span>
                </span>
                <RiExternalLinkLine className="size-4 shrink-0 text-text-link" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-caption-1-regular text-text-secondary text-pretty">
          Todavía no tiene ficha en Mendoza Transparente. Muchas fuerzas son frentes que varios partidos arman para una elección, con un
          nombre propio.
        </p>
      )}
    </Sheet>
  );
}
