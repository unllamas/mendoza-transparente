import { Info, type LucideIcon, TriangleAlert, X } from "lucide-react";
import { type ReactNode, useEffect } from "react";

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
    <div
      role="radiogroup"
      aria-label={label}
      className="-mx-4 flex max-w-[100vw] overflow-x-auto px-4 sm:mx-0 sm:max-w-full sm:px-0 [scrollbar-width:none]"
    >
      <div className="inline-flex shrink-0 rounded-lg border border-line bg-surface p-0.5 text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 whitespace-nowrap transition-colors ${
            o.value === value ? "bg-grid font-medium text-ink" : "text-ink-2 hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
      </div>
    </div>
  );
}

/** Encabezado de las páginas temáticas: ícono y nombre del tema arriba del título. */
export function PageHeader({ icon: Icon, tema, titulo, children }: { icon: LucideIcon; tema: string; titulo: string; children: ReactNode }) {
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <span className="flex items-center gap-2 text-sm text-ink-muted">
        <Icon className="size-4 text-ink-muted" aria-hidden />
        {tema}
      </span>
      <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{titulo}</h1>
      <p className="text-ink-2 text-pretty">{children}</p>
    </div>
  );
}

/** Hoja modal a la derecha, sobre toda la página. Escape o tocar afuera la cierra. */
export function Sheet({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <>
      <div aria-hidden onClick={onClose} className="fixed inset-0 z-30 bg-black/50 backdrop-blur-[1px]" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="fixed inset-y-0 right-0 z-40 flex w-full flex-col overflow-hidden border-l border-line bg-surface shadow-2xl sm:w-[32rem]"
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="mr-auto truncate text-sm font-medium">{titulo}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md px-2 py-1 text-ink-2 hover:bg-grid hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-6 overflow-y-auto p-4">{children}</div>
      </aside>
    </>
  );
}

/**
 * Recuadro para lo que hay que leer sí o sí.
 * - advertencia (ámbar): un problema o una señal: por qué importa un dato faltante, un sueldo no
 *   publicado, fuentes que no coinciden, una sola oferta, una empresa recién creada.
 * - nota (neutra): una aclaración de método para leer bien un número (inflación, devaluación, límites).
 */
export function Aviso({
  tipo = "advertencia",
  titulo,
  children,
}: {
  tipo?: "advertencia" | "nota";
  titulo?: string;
  children: ReactNode;
}) {
  const advertencia = tipo === "advertencia";
  const Icon = advertencia ? TriangleAlert : Info;
  return (
    <div
      role={advertencia ? "note" : undefined}
      className={`flex items-start gap-3 rounded-xl p-4 text-sm ${
        advertencia ? "border border-aviso-borde bg-aviso-fondo" : "bg-tile"
      }`}
    >
      <Icon className={`mt-0.5 size-4 shrink-0 ${advertencia ? "text-aviso" : "text-ink-muted"}`} aria-hidden />
      <div className="flex min-w-0 flex-col gap-1">
        {titulo && <span className="font-medium text-ink">{titulo}</span>}
        <div className="text-ink-2 text-pretty">{children}</div>
      </div>
    </div>
  );
}
