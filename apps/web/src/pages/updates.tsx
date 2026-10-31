import { buttonClassName } from "@mt/ui/components/base/buttons/button";
import { listRowVariants, listVariants } from "@mt/ui/components/card";
import { PageHeader, Section } from "@mt/ui/components/section";
import { RiArrowRightLine, RiArrowRightSLine, RiGithubLine, RiMegaphoneLine } from "@remixicon/react";
import { getRouteApi, Link } from "@tanstack/react-router";

import { Breadcrumbs, WithBreadcrumbs } from "@/components/breadcrumbs.tsx";
import { ShareButton } from "@/components/share-button.tsx";
import { formatDate } from "@/lib.ts";
import { slug } from "@/slug.ts";
import type { WeeklyUpdate } from "@/types.ts";

const indexApi = getRouteApi("/novedades");
const weekApi = getRouteApi("/novedades/$semana");

const weekLabel = (u: WeeklyUpdate) => `Semana del ${formatDate(u.week)}`;

/**
 * La imagen de la semana: la misma que se comparte (`/og/novedades-<semana>.webp`, la genera scripts/seo.ts en el
 * build). Guarda su lugar con la proporción de la imagen, así la página no salta cuando llega. En desarrollo no
 * existe (no hay build): queda el recuadro vacío.
 */
function WeekImage({ update, className, alt = "" }: { update: WeeklyUpdate; className?: string; alt?: string }) {
  return (
    <img
      src={`/og/novedades-${update.week}.webp`}
      alt={alt}
      width={1200}
      height={630}
      className={`aspect-[1200/630] border border-border-button-default bg-background-full object-cover ${className ?? ""}`}
    />
  );
}

/** `/novedades`: lo que se sumó al sitio, una entrada por semana, de la más nueva a la más vieja. */
export function UpdatesPage() {
  const updates = indexApi.useLoaderData();
  return (
    <div className="flex max-w-3xl flex-col gap-12">
      <WithBreadcrumbs items={[]} current={{ label: "Novedades", icon: RiMegaphoneLine }}>
        <PageHeader action={<ShareButton />} title="Novedades">
          Cada semana contamos qué sumamos al sitio: datos nuevos, páginas nuevas y lo que mejoramos a partir de lo que nos piden.
        </PageHeader>
      </WithBreadcrumbs>

      <ul className={listVariants()}>
        {updates.map((u) => (
          <li key={u.week}>
            <Link
              to="/novedades/$semana"
              params={{ semana: u.week }}
              className={listRowVariants()}
              data-track="updates.week.open"
              data-track-week={u.week}
            >
              <WeekImage update={u} className="w-24 shrink-0 rounded-lg sm:w-32" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-caption-1-regular text-text-secondary">{weekLabel(u)}</span>
                <span className="truncate font-medium text-text-link">{u.title}</span>
                <span className="truncate text-body-regular text-text-secondary">{u.summary}</span>
              </span>
              <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** `/novedades/<lunes>`: las novedades de una semana, cada una con su sección y el link a la página donde se ve. */
export function UpdatePage() {
  const { updates, week } = weekApi.useLoaderData();
  const i = updates.findIndex((u) => u.week === week);
  const update = updates[i];
  if (!update) return <NotFound />;
  const previous = updates[i + 1];
  return (
    <div className="flex max-w-3xl flex-col gap-12">
      <div className="flex flex-col gap-6">
        <WithBreadcrumbs items={[{ label: "Novedades", to: "/novedades" }]} current={{ label: weekLabel(update), icon: RiMegaphoneLine }}>
          <PageHeader action={<ShareButton />} title={update.title}>
            {update.summary}
          </PageHeader>
        </WithBreadcrumbs>
        <WeekImage update={update} alt={`${update.title}: ${update.items.length} novedades`} className="w-full rounded-xl" />
      </div>

      {update.items.map((item) => (
        <Section key={item.title} id={slug(item.title)} title={item.title}>
          <p className="text-body-regular text-text-secondary text-pretty">{item.text}</p>
          {item.link && (
            <a
              href={item.link.to}
              className={buttonClassName({ variant: "secondary", className: "self-start" })}
              data-track="updates.item.open"
              data-track-week={update.week}
              data-track-to={item.link.to}
            >
              {item.link.label}
              <RiArrowRightLine className="size-4" aria-hidden />
            </a>
          )}
        </Section>
      ))}

      <div className="flex flex-col gap-3">
        {previous && (
          <ul className={listVariants()}>
            <li>
              <Link
                to="/novedades/$semana"
                params={{ semana: previous.week }}
                className={listRowVariants()}
                data-track="updates.week.open"
                data-track-week={previous.week}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-caption-1-regular text-text-secondary">Semana anterior</span>
                  <span className="truncate font-medium text-text-link">{previous.title}</span>
                </span>
                <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
              </Link>
            </li>
          </ul>
        )}
        <a
          href={update.changesUrl}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 items-center gap-2 self-start text-body-regular text-text-link hover:underline"
          data-track="updates.changes.open"
          data-track-week={update.week}
        >
          <RiGithubLine className="size-4 shrink-0" aria-hidden /> Todos los cambios técnicos, en GitHub
        </a>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col gap-3">
      <Breadcrumbs items={[{ label: "Novedades", to: "/novedades" }]} current={{ label: "No encontrada" }} />
      <h1 className="text-title-1-semibold tracking-tight">No encontramos esa semana</h1>
      <p className="text-text-secondary">Puede que el enlace esté mal escrito. Las semanas van por el lunes en que empiezan.</p>
      <Link to="/novedades" className="w-fit text-text-link hover:underline">
        Ver todas las novedades ›
      </Link>
    </div>
  );
}
