import { RiArrowLeftSLine, RiArrowRightSLine } from "@remixicon/react";
import { Link } from "@tanstack/react-router";

/**
 * Breadcrumbs: Inicio › Sección › Página. The last item (without `to`) is the current page.
 * On phones only the parent is shown ("‹ Diputados provinciales"), so long trails never overlap.
 */
export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  const parent = [...items].reverse().find((it) => it.to) ?? { label: "Inicio", to: "/" };
  return (
    <nav aria-label="Ruta" className="text-caption-1-regular text-text-tertiary">
      <Link to={parent.to!} className="flex min-h-11 min-w-0 items-center gap-1 hover:text-text-link sm:hidden">
        <RiArrowLeftSLine className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{parent.label}</span>
      </Link>
      <span className="hidden min-w-0 items-center gap-1.5 sm:flex">
        <Link to="/" className="shrink-0 hover:text-text-link hover:underline">
          Inicio
        </Link>
        {items.map((it) => (
          <span key={it.label} className="flex min-w-0 items-center gap-1.5">
            <RiArrowRightSLine className="size-3.5 shrink-0" aria-hidden />
            {it.to ? (
              <Link to={it.to} className="truncate whitespace-nowrap hover:text-text-link hover:underline">
                {it.label}
              </Link>
            ) : (
              <span className="truncate text-text-secondary" aria-current="page" title={it.label}>
                {it.label}
              </span>
            )}
          </span>
        ))}
      </span>
    </nav>
  );
}
