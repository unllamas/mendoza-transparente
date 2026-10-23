import { listRowVariants, listVariants } from "@mt/ui/components/card";
import { RiExternalLinkLine } from "@remixicon/react";
import { Link } from "@tanstack/react-router";

import { mesCorto } from "@/lib.ts";
import type { ElectedRecord, PastPosition } from "@/types.ts";

/** The Ética Pública registry was loaded in August 2018: a position "since" then may have started earlier. */
const REGISTRY_START = "2018-08";

/** "2019-12-09" → "dic 2019". */
const monthYear = (iso: string) => `${mesCorto(Number(iso.slice(5, 7)))} ${iso.slice(0, 4)}`;

function period(p: PastPosition, today: string) {
  const ongoing = !p.to || p.to >= today;
  if (p.from && p.to && !ongoing) return `${monthYear(p.from)} – ${monthYear(p.to)}`;
  if (p.from) return ongoing ? `desde ${monthYear(p.from)}` : monthYear(p.from);
  return p.to ? `hasta ${monthYear(p.to)}` : "Sin fechas en el registro";
}

/** Elections a person won and positions they held, one block each. Informative: nothing here is tappable but the sources. */
export function Career({
  positions,
  elected,
  headingLevel = "h3",
}: {
  positions: PastPosition[];
  elected: ElectedRecord[];
  headingLevel?: "h3" | "h4";
}) {
  const Heading = headingLevel;
  const today = new Date().toISOString().slice(0, 10);
  // One link per proclamation record, named by the year of its election.
  const sources = new Map<string, string>();
  for (const e of elected) if (!sources.has(e.sourceUrl)) sources.set(e.sourceUrl, e.date.slice(0, 4));
  if (positions.length === 0 && elected.length === 0) return null;
  return (
    <div className="flex flex-col gap-6">
      {elected.length > 0 && (
        <section className="flex flex-col gap-2">
          <Heading className="text-body-semibold">{elected.length === 1 ? "Elección que ganó" : "Elecciones que ganó"}</Heading>
          <ul className={listVariants()}>
            {elected.map((e) => (
              <li key={`${e.date}-${e.role}-${e.place}`} className={listRowVariants({ interactive: false })}>
                <span className="w-11 shrink-0 text-body-semibold tabular-nums">{e.date.slice(0, 4)}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium">{e.role}</span>
                  <span className="truncate text-body-regular text-text-tertiary">{e.place}</span>
                  {e.party && e.partySlug ? (
                    <Link
                      to="/partidos/$slug"
                      params={{ slug: e.partySlug }}
                      data-track="official.party.open"
                      className="truncate text-body-regular text-text-link hover:underline"
                    >
                      {e.party}
                    </Link>
                  ) : (
                    <span className="truncate text-body-regular text-text-tertiary">El acta no dice el partido</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-caption-1-regular text-text-tertiary">
            Según las actas de proclamación de la Junta Electoral de Mendoza.
            {[...sources].map(([url, year]) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-text-link hover:underline"
              >
                Acta {year} <RiExternalLinkLine className="size-3.5" aria-hidden />
              </a>
            ))}
          </p>
        </section>
      )}
      {positions.length > 0 && (
        <section className="flex flex-col gap-2">
          <Heading className="text-body-semibold">{positions.length === 1 ? "Cargo registrado" : "Cargos registrados"}</Heading>
          <ul className={listVariants()}>
            {[...positions].reverse().map((p) => (
              <li key={`${p.from}-${p.role}-${p.agency}`} className={listRowVariants({ interactive: false })}>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium">{p.role}</span>
                  {p.agency && <span className="truncate text-body-regular text-text-secondary">{p.agency}</span>}
                  <span className="text-body-regular whitespace-nowrap text-text-tertiary tabular-nums sm:hidden">{period(p, today)}</span>
                </span>
                <span className="hidden shrink-0 text-body-regular whitespace-nowrap text-text-tertiary tabular-nums sm:block">
                  {period(p, today)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-caption-1-regular text-text-tertiary">
            Según la Oficina de Ética Pública, donde cada funcionario presenta su declaración jurada.
            {positions.some((p) => p.from?.startsWith(REGISTRY_START)) &&
              " El registro arrancó en agosto de 2018: un cargo que figura desde esa fecha puede haber empezado antes."}
          </p>
        </section>
      )}
    </div>
  );
}
