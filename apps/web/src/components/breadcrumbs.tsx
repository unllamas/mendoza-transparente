import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Breadcrumbs: Inicio › Sección › Página. The last item (without `to`) is the current page.
 * On phones only the parent is shown ("‹ Diputados provinciales"), so long trails never overlap.
 */
export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  const parent = [...items].reverse().find((it) => it.to) ?? { label: "Inicio", to: "/" };
  return (
    <nav aria-label="Ruta" className="text-sm text-ink-muted">
      <Link to={parent.to!} className="flex min-h-11 min-w-0 items-center gap-1 hover:text-link sm:hidden">
        <ChevronLeft className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{parent.label}</span>
      </Link>
      <span className="hidden min-w-0 items-center gap-1.5 sm:flex">
        <Link to="/" className="shrink-0 hover:text-link hover:underline">
          Inicio
        </Link>
        {items.map((it) => (
          <span key={it.label} className="flex min-w-0 items-center gap-1.5">
            <ChevronRight className="size-3.5 shrink-0" aria-hidden />
            {it.to ? (
              <Link to={it.to} className="truncate whitespace-nowrap hover:text-link hover:underline">
                {it.label}
              </Link>
            ) : (
              <span className="truncate text-ink-2" aria-current="page" title={it.label}>
                {it.label}
              </span>
            )}
          </span>
        ))}
      </span>
    </nav>
  );
}
