import { PartyAvatar, PersonAvatar } from "@mt/ui/components/avatar";
import { listRowVariants, listVariants } from "@mt/ui/components/card";
import { PageHeader, Section } from "@mt/ui/components/section";
import { StatTile } from "@mt/ui/components/stat-tile";
import { RiArrowRightSLine, RiExternalLinkLine, RiFlagLine, RiHistoryLine, RiUserLine } from "@remixicon/react";
import { getRouteApi, Link } from "@tanstack/react-router";

import { Breadcrumbs, WithBreadcrumbs } from "@/components/breadcrumbs.tsx";
import { EntityColumns } from "@/components/entity-columns.tsx";
import { ListSearch } from "@/components/list-search.tsx";
import { FuentesOficiales } from "@/components/official-sources.tsx";
import { ShareButton } from "@/components/share-button.tsx";
import { formatDate, formatNumber, normalizeText } from "@/lib.ts";
import type { GrupoFuncionario, PartyDetail, PartySummary } from "@/types.ts";
import { useUrlText } from "@/url-state.ts";

const indexApi = getRouteApi("/partidos");
const partyApi = getRouteApi("/partidos/$slug");

const SOURCES = ["legislatura", "autoridades", "junta-electoral"];
/** Without a search, the list of people elected before shows the latest ones. */
const RECENT = 20;
const MAX_RESULTS = 100;

const GROUP_TITLE: Record<GrupoFuncionario, string> = {
  ejecutivo: "Gobierno de Mendoza",
  intendentes: "Intendentes",
  senado_provincial: "Senado de Mendoza",
  diputados_provincial: "Cámara de Diputados de Mendoza",
  senado_nacional: "Senado de la Nación",
  diputados_nacional: "Cámara de Diputados de la Nación",
};

const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n === 1 ? one : many}`;

/** "partido o frente", "bloque legislativo" or both: how the sources use the name. */
const usesLabel = (uses: PartySummary["uses"]) =>
  uses.length === 2 ? "Partido o frente, y bloque legislativo" : uses[0] === "bloque" ? "Bloque legislativo" : "Partido o frente";

/** One line with what matters of a party in a list: who holds office today or, if nobody, what it won. */
const partyLine = (p: PartySummary) =>
  p.inOffice > 0
    ? `${formatNumber(p.inOffice)} en funciones`
    : p.seatsWon > 0
      ? `${plural(p.seatsWon, "cargo ganado", "cargos ganados")}, el último en ${p.lastElection}`
      : usesLabel(p.uses);

/** `/partidos`: every party, front and bloc the official sources name, with who holds office under each one. */
export function PartiesPage() {
  const parties = indexApi.useLoaderData();
  const current = parties.filter((p) => p.inOffice > 0);
  const past = parties.filter((p) => p.inOffice === 0);
  return (
    <div className="flex flex-col gap-10">
      <WithBreadcrumbs items={[{ label: "Funcionarios", to: "/funcionarios" }]} current={{ label: "Partidos", icon: RiFlagLine }}>
        <PageHeader action={<ShareButton />} title="Partidos, frentes y bloques">
          Quiénes ocupan un cargo hoy con cada partido, frente o bloque de Mendoza, y cuántos cargos ganó cada uno en las elecciones desde
          2015, según las fuentes oficiales.
        </PageHeader>
      </WithBreadcrumbs>

      <PartyList id="con-cargos" title={`Con cargos hoy (${current.length})`} parties={current} />
      <PartyList id="elecciones-anteriores" title={`En elecciones anteriores (${past.length})`} parties={past} />

      <Section id="como-se-arma" title="Cómo se arma esta lista">
        <div className="flex max-w-2xl flex-col gap-3 text-body-regular text-text-secondary text-pretty">
          <p>
            A cada legislador se lo muestra con el bloque que publica su cámara, y a intendentes y electos, con el partido o frente del acta
            de la Junta Electoral. Los cargos designados, como los ministros, no tienen partido en ninguna fuente oficial, y no les
            asignamos el del gobierno que los nombró.
          </p>
          <p>
            Las fuentes escriben un mismo nombre de varias formas («Alianza Cambia Mendoza», «Frente Cambia Mendoza»). Las juntamos solo
            cuando es el mismo nombre, y cada página dice cuáles y por qué. Nunca juntamos partidos distintos.
          </p>
        </div>
      </Section>

      <FuentesOficiales ids={SOURCES} />
    </div>
  );
}

function PartyList({ id, title, parties }: { id: string; title: string; parties: PartySummary[] }) {
  if (parties.length === 0) return null;
  return (
    <Section id={id} title={title}>
      <ul className={listVariants()}>
        {parties.map((p) => (
          <li key={p.slug}>
            <Link to="/partidos/$slug" params={{ slug: p.slug }} data-track="party.open" className={listRowVariants()}>
              <PartyAvatar party={p} className="size-10" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium text-text-link">{p.name}</span>
                <span className="truncate text-body-regular text-text-tertiary">{partyLine(p)}</span>
              </span>
              <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** `/partidos/<slug>`: who holds office under this name today, what it won in each election and who it elected before. */
export function PartyPage() {
  const party = partyApi.useLoaderData();
  if (!party) return <NotFound />;
  const p = party;
  return (
    <div className="flex flex-col gap-10">
      <EntityColumns
        aside={
          <>
            <WithBreadcrumbs
              items={[
                { label: "Funcionarios", to: "/funcionarios" },
                { label: "Partidos", to: "/partidos" },
              ]}
              current={{ label: p.name, icon: RiFlagLine }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <PartyAvatar party={p} className="size-16" />
                  <div className="flex min-w-0 flex-col gap-1">
                    <h1 className="text-title-1-semibold tracking-tight text-balance text-text-primary sm:text-display-4-semibold">
                      {p.name}
                    </h1>
                    <span className="text-body-regular text-text-secondary">{usesLabel(p.uses)} en Mendoza</span>
                  </div>
                </div>
                <div className="shrink-0">
                  <ShareButton />
                </div>
              </div>
            </WithBreadcrumbs>
            <div className="grid grid-cols-2 gap-3">
              <StatTile icon={RiUserLine} label="En funciones" value={formatNumber(p.inOffice)} note="Hoy, en cargos electos" />
              <StatTile
                icon={RiHistoryLine}
                label="Cargos ganados"
                value={formatNumber(p.seatsWon)}
                note={p.seatsWon ? "Titulares, desde 2015" : "En las actas desde 2015"}
              />
            </div>
            {p.aliases.length > 0 && <Aliases party={p} />}
          </>
        }
      >
        {/* Nobody in office today: what it won goes first, the empty list after. */}
        {p.members.length > 0 ? (
          <>
            <Members party={p} />
            <Elections party={p} />
          </>
        ) : (
          <>
            <Elections party={p} />
            <Members party={p} />
          </>
        )}
        <Former party={p} />
      </EntityColumns>
      <FuentesOficiales ids={SOURCES} />
    </div>
  );
}

/** Other ways the sources write the name, and why each one counts as the same. */
function Aliases({ party: p }: { party: PartyDetail }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-body-semibold">También figura como</h2>
      <ul className="flex flex-col gap-2 text-body-regular">
        {p.aliases.map((a) => (
          <li key={a.name} className="flex flex-col gap-0.5">
            <span className="font-medium">{a.name}</span>
            <span className="text-caption-1-regular text-text-tertiary text-pretty">{a.reason}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Members({ party: p }: { party: PartyDetail }) {
  return (
    <Section id="en-funciones" title="Quiénes están en funciones">
      {p.members.length === 0 ? (
        <p className="text-body-regular text-text-secondary">
          Hoy nadie ocupa un cargo con este nombre según las fuentes oficiales.{" "}
          <Link to="/partidos" className="whitespace-nowrap text-text-link hover:underline">
            Ver todos los partidos ›
          </Link>
        </p>
      ) : (
        p.members.map((g) => (
          <div key={g.group} className="flex flex-col gap-2">
            <h3 className="text-body-semibold">
              {GROUP_TITLE[g.group]} <span className="font-normal text-text-tertiary">· {g.people.length}</span>
            </h3>
            <ul className={listVariants()}>
              {g.people.map((m) => (
                <li key={m.id}>
                  <Link
                    to="/funcionarios/$role/$slug"
                    params={{ role: m.role, slug: m.slug }}
                    data-track="party.member.open"
                    className={listRowVariants()}
                  >
                    <PersonAvatar name={m.name} photo={m.photo} className="size-10 text-caption-1-regular" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-medium group-hover:text-text-link">{m.name}</span>
                      <span className="truncate text-body-regular text-text-tertiary">
                        {[m.place, m.asWritten !== p.name && `${m.via === "bloque" ? "Bloque" : "Figura como"} «${m.asWritten}»`]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    {m.mandateTo && (
                      <span className="hidden text-body-regular whitespace-nowrap text-text-tertiary tabular-nums sm:block">
                        hasta {m.mandateTo}
                      </span>
                    )}
                    <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
      {p.members.length > 0 && (
        <p className="text-caption-1-regular text-text-tertiary">
          Legisladores, por el bloque que publica su cámara; intendentes, gobernador y vice, por el partido o frente con el que fueron
          electos.{" "}
          <Link to="/funcionarios" className="text-text-link hover:underline">
            Ver todos los funcionarios ›
          </Link>
        </p>
      )}
    </Section>
  );
}

function Elections({ party: p }: { party: PartyDetail }) {
  if (p.elections.length === 0) return null;
  return (
    <Section id="elecciones" title="Qué ganó en cada elección">
      <ul className={listVariants()}>
        {p.elections.map((e) => (
          <li key={e.date} className={listRowVariants({ interactive: false })}>
            <span className="w-11 shrink-0 text-body-semibold tabular-nums">{e.year}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-medium text-pretty">{e.offices.map((o) => `${o.label}: ${formatNumber(o.count)}`).join(" · ")}</span>
              <a
                href={e.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-fit items-center gap-1 text-body-regular text-text-link hover:underline"
              >
                Acta de proclamación
                {p.elections.filter((x) => x.year === e.year).length > 1 && ` del ${formatDate(e.date)}`}{" "}
                <RiExternalLinkLine className="size-4" aria-hidden />
              </a>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-caption-1-regular text-text-tertiary">
        Bancas y cargos ganados como titular, no votos.{" "}
        <Link to="/funcionarios/historial" hash="elecciones" className="text-text-link hover:underline">
          Cómo se repartieron entre todos los partidos ›
        </Link>
      </p>
    </Section>
  );
}

function Former({ party: p }: { party: PartyDetail }) {
  const [query, setQuery] = useUrlText("q");
  if (p.former.length === 0) return null;
  const words = normalizeText(query.trim()).split(/\s+/).filter(Boolean);
  const matches = words.length
    ? p.former.filter((f) => words.every((w) => normalizeText(`${f.name} ${f.role} ${f.place}`).includes(w)))
    : p.former;
  const shown = matches.slice(0, words.length ? MAX_RESULTS : RECENT);
  return (
    <Section id="electos-antes" title={`Electos que hoy no tienen cargo (${formatNumber(p.former.length)})`}>
      {p.former.length > RECENT && (
        <ListSearch value={query} onChange={setQuery} placeholder="Buscar por nombre, cargo o lugar" label="Buscar electo" />
      )}
      {shown.length === 0 ? (
        <p className="text-body-regular text-text-secondary">Nadie coincide con esa búsqueda. Probá solo con el apellido.</p>
      ) : (
        <ul className={listVariants()}>
          {shown.map((f) => (
            <li key={f.id}>
              <Link
                to="/funcionarios/historial"
                search={{ persona: f.id } as never}
                data-track="party.former.open"
                className={listRowVariants()}
              >
                <span className="w-11 shrink-0 text-body-semibold tabular-nums">{f.year}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium text-text-link">{f.name}</span>
                  <span className="truncate text-body-regular text-text-tertiary">{[f.role, f.place].join(" · ")}</span>
                </span>
                <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {matches.length > shown.length && (
        <p className="text-caption-1-regular text-text-tertiary">
          Se muestran {shown.length} de {formatNumber(matches.length)}. Buscá por nombre para ver el resto.
        </p>
      )}
    </Section>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col gap-3">
      <Breadcrumbs items={[{ label: "Partidos", to: "/partidos" }]} current={{ label: "No encontrado" }} />
      <h1 className="text-title-1-semibold tracking-tight">No encontramos ese partido</h1>
      <p className="text-text-secondary">Puede que el enlace esté mal escrito o que ya no figure en las fuentes oficiales.</p>
      <Link to="/partidos" className="w-fit text-text-link hover:underline">
        Ver todos los partidos ›
      </Link>
    </div>
  );
}
