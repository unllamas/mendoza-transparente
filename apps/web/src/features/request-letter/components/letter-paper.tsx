import { Button } from "@mt/ui/components/base/buttons/button";
import { IconButton } from "@mt/ui/components/base/buttons/icon-button";
import { cx } from "@mt/ui/lib/cx";
import { RiAddLine, RiCloseLine } from "@remixicon/react";
import type { RequestTarget } from "@/types.ts";
import { ATTENTION, CLOSING, legalBasis, longDate, type Requester, TITLE } from "../utils/letter.ts";

/** A blank on the paper: light blue, grows with what is typed (16 px or more, so iOS does not zoom in). */
function Blank({ value, onChange, hint }: { value: string; onChange: (v: string) => void; hint: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={hint}
      aria-label={hint}
      className={cx(
        "field-sizing-content max-w-full min-w-[8ch] rounded-sm border-b-2 border-accent-400 bg-accent-50 px-1 font-serif text-neutral-900 italic placeholder:text-accent-700/60 focus:bg-accent-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        value && "not-italic",
      )}
    />
  );
}

/** The letter as it will be printed, filled in on the page: the blanks and the points are the form. */
export function LetterPaper({
  target,
  points,
  onPointsChange,
  requester: p,
  onRequesterChange,
}: {
  target: RequestTarget;
  points: string[];
  onPointsChange: (points: string[]) => void;
  requester: Requester;
  onRequesterChange: (field: keyof Requester, value: string) => void;
}) {
  const field = (k: keyof Requester) => (v: string) => onRequesterChange(k, v);
  return (
    <article
      aria-label="Nota de pedido"
      className="-mx-4 flex flex-col gap-6 bg-white px-6 py-10 font-serif text-[17px] leading-[1.75] text-neutral-900 shadow-sm ring-1 ring-separator-border sm:mx-0 sm:rounded-xl sm:px-16 sm:py-16 sm:text-lg"
    >
      <p className="text-right">
        <Blank value={p.city} onChange={field("city")} hint={target.city} />, {longDate()}
      </p>
      <div>
        <p className="font-semibold">{target.label}</p>
        <p>{ATTENTION}</p>
        <p>S / D</p>
      </div>
      <h2 className="text-center font-bold tracking-wide uppercase">{TITLE}</h2>
      <p className="text-pretty">
        Quien suscribe, <Blank value={p.name} onChange={field("name")} hint="nombre y apellido" />, documento (opcional){" "}
        <Blank value={p.dni} onChange={field("dni")} hint="DNI" />, con domicilio en{" "}
        <Blank value={p.address} onChange={field("address")} hint="domicilio" /> y contacto en{" "}
        <Blank value={p.contact} onChange={field("contact")} hint="correo o teléfono" />, en ejercicio del derecho reconocido por{" "}
        {legalBasis(target)}, solicita la siguiente información:
      </p>
      <ol className="flex flex-col gap-2">
        {points.map((point, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="w-6 shrink-0 pt-px text-right tabular-nums">{i + 1}.</span>
            <textarea
              aria-label={`Punto ${i + 1} del pedido`}
              value={point}
              onChange={(e) => onPointsChange(points.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder="Escribí qué información querés, lo más preciso posible"
              className="field-sizing-content min-w-0 flex-1 resize-none rounded-sm bg-transparent px-1 font-serif text-pretty hover:bg-accent-50 focus:bg-accent-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            />
            <IconButton
              icon={RiCloseLine}
              aria-label={`Quitar el punto ${i + 1}`}
              onClick={() => onPointsChange(points.filter((_, j) => j !== i))}
              className="-my-2 shrink-0 bg-transparent font-sans text-text-tertiary hover:bg-background-action"
            />
          </li>
        ))}
        <li className="pl-8 font-sans">
          <Button
            variant="secondary"
            leadingIcon={RiAddLine}
            onClick={() => onPointsChange([...points, ""])}
            id="nota-agregar-punto"
            data-track="request_letter.point.add"
          >
            Agregar un punto
          </Button>
        </li>
      </ol>
      <p className="text-pretty">{CLOSING}</p>
      <p>Saludos cordiales.</p>
      <div className="mt-6 grid gap-8 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="flex flex-col gap-1">
          <span className="mb-2">Firma:</span>
          <span className="mb-2 h-12 w-64 max-w-full border-b border-neutral-500" aria-hidden />
          <span>Aclaración: {p.name}</span>
        </div>
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-neutral-400 p-4 text-base text-neutral-600 sm:w-64">
          <span className="font-semibold">Recibido</span>
          <span>Fecha: ________________</span>
          <span>Expediente n.º: _________</span>
        </div>
      </div>
    </article>
  );
}
