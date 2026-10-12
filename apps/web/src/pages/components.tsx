/**
 * App-level pieces built on the design system (@mt/ui): the ones that need analytics or the router.
 * Generic components (Button, IconButton, Badge, Tile, CardLink, Alert, StatTile, Section, PageHeader,
 * PersonAvatar, Popover) are imported straight from @mt/ui/components/*. Documented in docs/procesos/diseno.md.
 */

import { Badge } from "@mt/ui/components/badge";
import { SearchInput } from "@mt/ui/components/search-input";
import { Segmented as BaseSegmented } from "@mt/ui/components/segmented";
import { Sheet as BaseSheet } from "@mt/ui/components/sheet";
import { cn } from "@mt/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useEffect } from "react";

import { track } from "../analytics.ts";

const ESTADOS: Record<string, { label: string; color: string; icon: string }> = {
  activo: { label: "Activa", color: "bg-good", icon: "✓" },
  pendiente: { label: "Pendiente", color: "bg-warning", icon: "…" },
  roto: { label: "Con errores", color: "bg-critical", icon: "!" },
};

/** Estado de una fuente: siempre con ícono y texto, nunca solo color. */
export function EstadoBadge({ estado }: { estado: string }) {
  const e = ESTADOS[estado] ?? { label: estado, color: "bg-axis", icon: "·" };
  return (
    <Badge size="lg" className="bg-transparent px-0 font-normal">
      <span aria-hidden className={cn("inline-flex size-4 items-center justify-center rounded-full text-[10px] font-bold text-white", e.color)}>
        {e.icon}
      </span>
      {e.label}
    </Badge>
  );
}

/** Opciones excluyentes con analítica: cada cambio envía `<trackId>.change` (por defecto `segmented.change`). */
export function Segmented<T extends string>({
  trackId,
  onChange,
  ...props
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  trackId?: string;
}) {
  return (
    <BaseSegmented
      {...props}
      onChange={(v) => {
        if (v !== props.value) track(`${trackId ?? "segmented"}.change`, { value: v, label: props.label });
        onChange(v);
      }}
    />
  );
}

/** Hoja modal con analítica: toda hoja envía `sheet.open` y `sheet.close` (con los segundos que estuvo abierta). */
export function Sheet({
  titulo,
  onClose,
  children,
  trackId,
  header,
}: {
  titulo: string;
  onClose: () => void;
  children: ReactNode;
  /** Analytics id of this sheet ("missing_data.request"). */
  trackId?: string;
  header?: ReactNode;
}) {
  useEffect(() => {
    const opened = Date.now();
    track("sheet.open", { sheet: trackId ?? titulo });
    return () => track("sheet.close", { sheet: trackId ?? titulo, seconds: Math.round((Date.now() - opened) / 1000) });
  }, [trackId, titulo]);
  return (
    <BaseSheet title={titulo} onClose={onClose} header={header} closeProps={{ "data-track": "sheet.close_button" }}>
      {children}
    </BaseSheet>
  );
}

/**
 * Miga de pan: Inicio › Sección › Página. El último elemento (sin `to`) es la página actual.
 * On phones only the parent is shown ("‹ Diputados provinciales"), so long trails never overlap.
 */
export function Migas({ items }: { items: { label: string; to?: string }[] }) {
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

/** Buscador de las listas largas, con analítica: un `search.query` cuando la persona deja de escribir. */
export function Buscador({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) return;
    const t = setTimeout(() => track("search.query", { search: label, query: q.slice(0, 80) }), 1200);
    return () => clearTimeout(t);
  }, [value, label]);
  return <SearchInput value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} label={label} />;
}

export const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
