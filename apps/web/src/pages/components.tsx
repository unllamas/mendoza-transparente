import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Dato informativo: solo fondo, sin borde. El borde queda reservado para lo que se puede tocar. */
export function StatTile({ label, value, note, icon: Icon }: { label: string; value: string; note?: string; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-tile p-4">
      <span className="flex min-w-0 items-center gap-2 text-sm text-ink-2" title={label}>
        {Icon && <Icon className="size-4 shrink-0 text-ink-muted" aria-hidden />}
        <span className="truncate">{label}</span>
      </span>
      <span className="truncate text-2xl font-semibold tracking-tight whitespace-nowrap sm:text-3xl" title={value}>
        {value}
      </span>
      {note && <span className="text-xs text-ink-muted">{note}</span>}
    </div>
  );
}

const ESTADOS: Record<string, { label: string; color: string; icon: string }> = {
  activo: { label: "Activa", color: "bg-good", icon: "✓" },
  pendiente: { label: "Pendiente", color: "bg-warning", icon: "…" },
  roto: { label: "Con errores", color: "bg-critical", icon: "!" },
};

/** Estado de una fuente: siempre con ícono y texto, nunca solo color. */
export function EstadoBadge({ estado }: { estado: string }) {
  const e = ESTADOS[estado] ?? { label: estado, color: "bg-axis", icon: "·" };
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink-2">
      <span
        aria-hidden
        className={`inline-flex size-4 items-center justify-center rounded-full text-[10px] font-bold text-white ${e.color}`}
      >
        {e.icon}
      </span>
      {e.label}
    </span>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

/** Selector de opciones excluyentes (por ejemplo, el período de un gráfico). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1 transition-colors ${
            o.value === value ? "bg-grid font-medium text-ink" : "text-ink-2 hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Encabezado de las páginas temáticas: ícono y nombre del tema arriba del título. */
export function PageHeader({ icon: Icon, tema, titulo, children }: { icon: LucideIcon; tema: string; titulo: string; children: ReactNode }) {
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <span className="flex items-center gap-2 text-sm text-ink-muted">
        <Icon className="size-4 text-accent" aria-hidden />
        {tema}
      </span>
      <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{titulo}</h1>
      <p className="text-ink-2 text-pretty">{children}</p>
    </div>
  );
}
