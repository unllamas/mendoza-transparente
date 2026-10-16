import { type RemixiconComponentType, RiArrowRightSLine } from "@remixicon/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

type Crumb = { label: string; to: string };
/** The current page: it takes the place of the topic line above the title, with its icon, so the header has one line. */
type Current = { label: string; icon?: RemixiconComponentType };

const crumbLink = "flex min-h-11 shrink-0 items-center hover:text-text-link hover:underline sm:min-h-0";

function CurrentCrumb({ current }: { current: Current }) {
  const Icon = current.icon;
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-text-secondary" aria-current="page" title={current.label}>
      {Icon && <Icon className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />}
      <span className="truncate">{current.label}</span>
    </span>
  );
}

const Chevron = () => <RiArrowRightSLine className="size-3.5 shrink-0" aria-hidden />;

/**
 * Breadcrumbs: Inicio › Sección › página actual (with its icon). Items are the linked ancestors.
 * On phones only the parent and the current page are shown ("Municipios › San Rafael"), so long trails never overlap.
 */
export function Breadcrumbs({ items, current }: { items: Crumb[]; current: Current }) {
  const parent = items.at(-1) ?? { label: "Inicio", to: "/" };
  return (
    <nav aria-label="Ruta" className="text-caption-1-regular whitespace-nowrap text-text-tertiary">
      <span className="flex min-w-0 items-center gap-1.5 sm:hidden">
        <Link to={parent.to} className={crumbLink}>
          {parent.label}
        </Link>
        <Chevron />
        <CurrentCrumb current={current} />
      </span>
      <span className="hidden min-w-0 items-center gap-1.5 sm:flex">
        {[{ label: "Inicio", to: "/" }, ...items].map((it) => (
          <span key={it.label} className="flex min-w-0 items-center gap-1.5">
            <Link to={it.to} className="truncate hover:text-text-link hover:underline">
              {it.label}
            </Link>
            <Chevron />
          </span>
        ))}
        <CurrentCrumb current={current} />
      </span>
    </nav>
  );
}

/**
 * Breadcrumbs glued to the header they introduce. On phones the link is already 44 px tall, so it needs no extra gap:
 * the page's own gap (gap-8 to gap-12) would leave a hole between "Municipios › San Rafael" and the title.
 */
export function WithBreadcrumbs({ items, current, children }: { items: Crumb[]; current: Current; children: ReactNode }) {
  return (
    <div className="flex flex-col sm:gap-2">
      <Breadcrumbs items={items} current={current} />
      {children}
    </div>
  );
}
