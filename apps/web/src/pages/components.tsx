import type { ReactNode } from "react";

export function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4">
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
