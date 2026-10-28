import type { Block, DataCard, Level } from "@mt/assistant/types";
import { listRowVariants, listVariants } from "@mt/ui/components/card";
import { cx } from "@mt/ui/lib/cx";
import { type RemixiconComponentType, RiArrowRightSLine, RiArrowRightUpLine, RiMapPin2Line, RiSearchLine } from "@remixicon/react";
import { Link } from "@tanstack/react-router";
import { formatDate, formatNumber } from "@/lib.ts";
import { activityIcon } from "./activity-icons.ts";
import { FolderButton } from "./folder/folder-button.tsx";

type Icon = RemixiconComponentType;

const LEVELS: Record<Level, string> = { nacion: "Nación", provincia: "Provincia", municipio: "Municipio" };

/** Acciones dentro de una respuesta: blancas y elevadas, con ícono y flecha, para que nunca parezcan un mensaje. */
function ActionRow({ icon: Icon, label, onPress, primary }: { icon: Icon; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <li>
      <button type="button" onClick={onPress} className={listRowVariants()}>
        <Icon className={cx("size-5 shrink-0", primary ? "text-text-link" : "text-foreground-icon-secondary")} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-body-medium text-text-link">{label}</span>
        <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
      </button>
    </li>
  );
}

/** Las ordenanzas imprimen las actividades en mayúsculas ("QUIOSCO INTERIOR"): se muestran como oración. */
const asSentence = (name: string) => (name === name.toUpperCase() ? name.charAt(0) + name.slice(1).toLowerCase() : name);

const PERIODS: Record<string, string> = { mes: "por mes", bimestre: "por bimestre", año: "por año" };

/**
 * La tasa de comercio que pidió la persona: informativa, así que plana sobre el gris y con un borde fino. La primera
 * línea es su actividad; las otras son actividades que la misma ordenanza distingue, cada una con su rango, nunca unidas.
 */
function FeeView({ fee }: { fee: Extract<Block, { type: "fee" }>["fee"] }) {
  const period = PERIODS[fee.period];
  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption-1-regular text-text-secondary">
        Derecho de comercio en {fee.municipality}
        {fee.year ? `, ${fee.year}` : ""}
        {period ? `, ${period}` : ""}. De la categoría más baja a la más alta.
      </p>
      <ul className="flex flex-col divide-y divide-separator-border rounded-xl border border-separator-border">
        {fee.lines.map((line, i) => (
          <li key={line.name} className="flex min-h-11 min-w-0 flex-col justify-center px-4 py-2">
            {/* El nombre de la ordenanza distingue las líneas: hasta dos líneas, nunca cortado para que parezcan iguales. */}
            <span className="line-clamp-2 text-caption-1-regular text-pretty text-text-secondary">
              {i > 0
                ? `También figura: ${asSentence(line.name)}`
                : line.name === fee.activity
                  ? fee.activity
                  : `${fee.activity}: ${asSentence(line.name)}`}
            </span>
            <span className="truncate text-body-semibold whitespace-nowrap text-text-primary tabular-nums">
              $&nbsp;{formatNumber(Math.round(line.min))} a $&nbsp;{formatNumber(Math.round(line.max))}
            </span>
          </li>
        ))}
      </ul>
      {fee.note && <p className="text-caption-1-regular text-pretty text-text-secondary">{fee.note}</p>}
      {fee.source.href && (
        <a
          href={fee.source.href}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 items-center gap-1 self-start text-caption-1-regular text-text-link hover:underline"
        >
          {fee.source.label}
          <RiArrowRightUpLine className="size-4 shrink-0" aria-hidden />
        </a>
      )}
    </div>
  );
}

/**
 * Lo que el sitio publica sobre la pregunta (proveedores, una autoridad, un municipio…). La misma lista que el resto del
 * sitio: una fila que abre su página es blanca con su flecha, una fila que solo informa toma el gris, así una tarjeta de
 * cifras (un municipio) queda plana y una lista de proveedores se eleva. La última fila abre la sección completa. Los
 * valores llegan formateados desde la API.
 */
function SiteDataView({ card, onNavigate }: { card: DataCard; onNavigate: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption-1-regular text-text-secondary">{card.title}</p>
      {card.rows.length > 0 && (
        <ul className={listVariants()}>
          {card.rows.map((row) => {
            const body = (
              <>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="line-clamp-2 text-caption-1-regular text-pretty text-text-secondary">{row.label}</span>
                  {/* Las cifras van en una línea; un cargo largo ("Ministra de Seguridad y Justicia") ocupa dos. */}
                  {row.value && (
                    <span className="line-clamp-2 text-body-semibold text-pretty text-text-primary tabular-nums">{row.value}</span>
                  )}
                  {row.detail && <span className="line-clamp-2 text-caption-1-regular text-pretty text-text-secondary">{row.detail}</span>}
                </span>
                {row.href && <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />}
              </>
            );
            return (
              <li key={`${row.label}-${row.href ?? row.value}`}>
                {row.href ? (
                  <Link to={row.href} onClick={onNavigate} className={cx(listRowVariants(), "gap-2 py-2")}>
                    {body}
                  </Link>
                ) : (
                  <div className={cx(listRowVariants({ interactive: false }), "gap-2 py-2")}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {card.note && <p className="text-caption-1-regular text-pretty text-text-secondary">{card.note}</p>}
      <ul className={listVariants()}>
        <li>
          <Link to={card.link.href} onClick={onNavigate} className={listRowVariants()}>
            <span className="min-w-0 flex-1 truncate text-body-medium text-text-link">{card.link.label}</span>
            <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
          </Link>
        </li>
      </ul>
    </div>
  );
}

export type BlockHandlers = {
  onLocate: () => void;
  onPickMunicipality: () => void;
  onSearchActivity: (options: { id?: string; label: string; words?: string[] }[]) => void;
  onChoose: (text: string) => void;
  /** Se abrió un enlace a una página del sitio (en celulares el panel se cierra para que se vea la página). */
  onNavigate: () => void;
};

/** Actividades mostradas como filas; el resto está a una búsqueda. */
const VISIBLE_ACTIVITIES = 4;

/** Un bloque de una respuesta. `answered` oculta las opciones una vez que la persona las respondió. */
export function BlockView({ block, answered, handlers }: { block: Block; answered: boolean; handlers: BlockHandlers }) {
  switch (block.type) {
    case "ask_municipality":
      if (answered) return null;
      return (
        <ul className={listVariants()}>
          <ActionRow icon={RiMapPin2Line} label="Usar mi ubicación" onPress={handlers.onLocate} primary />
          <ActionRow icon={RiSearchLine} label="Buscar el municipio" onPress={handlers.onPickMunicipality} />
        </ul>
      );
    case "ask_activity":
      if (answered) return null;
      return (
        <ul className={listVariants()}>
          {block.options.slice(0, VISIBLE_ACTIVITIES).map((option) => (
            <ActionRow
              key={option.id}
              icon={activityIcon(option.id, option.label)}
              label={option.label}
              onPress={() => handlers.onChoose(option.label)}
              primary
            />
          ))}
          <ActionRow icon={RiSearchLine} label="Buscar otro rubro" onPress={() => handlers.onSearchActivity(block.options)} />
        </ul>
      );
    case "steps":
      return (
        <>
          <ol className={listVariants()}>
            {block.steps.map((step, i) => (
              <li key={`${step.title}-${step.href}`}>
                {/* Compacto a propósito: número, título y una o dos líneas de lo que importa; la fuente es la flecha. */}
                <a href={step.href} target="_blank" rel="noreferrer" className={cx(listRowVariants(), "gap-2.5 px-3 py-2.5")}>
                  <span className="w-3.5 shrink-0 self-start pt-px text-caption-1-medium text-text-tertiary tabular-nums">{i + 1}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="line-clamp-2 text-body-medium text-pretty text-text-primary">{step.title}</span>
                    <span className="line-clamp-2 text-caption-1-regular text-pretty text-text-secondary">{step.detail}</span>
                  </span>
                  <RiArrowRightUpLine
                    className="size-4 shrink-0 text-text-link"
                    aria-label={`Abrir la fuente oficial (${LEVELS[step.level]})`}
                  />
                </a>
              </li>
            ))}
          </ol>
          <FolderButton block={block} />
          <p className="text-caption-1-regular text-text-tertiary">Verificado el {formatDate(block.verified)}</p>
        </>
      );
    case "fee":
      return <FeeView fee={block.fee} />;
    case "data":
      return <SiteDataView card={block.card} onNavigate={handlers.onNavigate} />;
    case "unpublished":
      return (
        <ul className={listVariants()}>
          <li>
            <Link to="/pedir" className={listRowVariants()}>
              <span className="min-w-0 flex-1 truncate text-body-medium text-text-link">
                Pedir el dato a {block.agency.replace(/^Municipalidad de /, "")}
              </span>
              <RiArrowRightUpLine className="size-5 shrink-0 text-text-link" aria-hidden />
            </Link>
          </li>
        </ul>
      );
  }
}
