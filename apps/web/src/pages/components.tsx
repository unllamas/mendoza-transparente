import type { ReactNode } from "react";

/** Dato informativo: solo fondo, sin borde. El borde queda reservado para lo que se puede tocar. */
export function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-tile p-4">
      <span className="text-sm text-ink-2">{label}</span>
      <span className="text-3xl font-semibold tracking-tight">{value}</span>
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
