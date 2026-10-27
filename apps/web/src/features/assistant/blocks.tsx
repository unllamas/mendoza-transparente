import type { Block, Level } from "@mt/assistant/types";
import { listRowVariants, listVariants } from "@mt/ui/components/card";
import { cx } from "@mt/ui/lib/cx";
import {
  type RemixiconComponentType,
  RiArrowRightSLine,
  RiArrowRightUpLine,
  RiFileDownloadLine,
  RiMapPin2Line,
  RiMoreLine,
  RiRestaurant2Line,
  RiSearchLine,
  RiShoppingBasket2Line,
  RiStore2Line,
  RiTShirt2Line,
} from "@remixicon/react";
import { Link } from "@tanstack/react-router";
import { formatDate, formatNumber, normalizeText } from "@/lib.ts";

type Icon = RemixiconComponentType;

const LEVELS: Record<Level, string> = { nacion: "Nación", provincia: "Provincia", municipio: "Municipio" };

/** The API only sends an id and a label per activity, so the icon is guessed from the label; unknown ones get a shop. */
function activityIcon(label: string): Icon {
  const text = normalizeText(label);
  if (/almacen|kiosco|verdule|fiambre/.test(text)) return RiShoppingBasket2Line;
  if (/ropa|indumentaria|calzado/.test(text)) return RiTShirt2Line;
  if (/comida|restaurante|bar |panaderia|cafe/.test(text)) return RiRestaurant2Line;
  if (/otro/.test(text)) return RiMoreLine;
  return RiStore2Line;
}

/** Actions inside an answer: white and lifted, with an icon and an arrow, so they never look like a message. */
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

/** Ordinances print activities in capitals ("QUIOSCO INTERIOR"): shown as a sentence. */
const asSentence = (name: string) => (name === name.toUpperCase() ? name.charAt(0) + name.slice(1).toLowerCase() : name);

const PERIODS: Record<string, string> = { mes: "por mes", bimestre: "por bimestre", año: "por año" };

/**
 * The trade fee the person asked for: informative, so flat on the grey with a thin border. The first line is their
 * activity; the others are activities the same ordinance tells apart, each with its own range, never merged.
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
            {/* The ordinance's name is what tells the lines apart: up to two lines, never cut to look the same. */}
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

export type BlockHandlers = {
  onLocate: () => void;
  onPickMunicipality: () => void;
  onSearchActivity: (options: { label: string; words?: string[] }[]) => void;
  onChoose: (text: string) => void;
};

/** Activities shown as rows; the rest are a search away. */
const VISIBLE_ACTIVITIES = 4;

/** One block of an answer. `answered` hides the options once the person has replied to them. */
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
              icon={activityIcon(option.label)}
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
                <a href={step.href} target="_blank" rel="noreferrer" className={listRowVariants()}>
                  <span className="w-4 shrink-0 text-body-medium text-text-tertiary tabular-nums">{i + 1}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body-medium text-text-primary">{step.title}</span>
                    <span className="text-caption-1-regular text-pretty text-text-secondary">
                      {LEVELS[step.level]} · {step.detail}
                    </span>
                  </span>
                  <RiArrowRightUpLine className="size-5 shrink-0 text-text-link" aria-label="Abrir la fuente oficial" />
                </a>
              </li>
            ))}
          </ol>
          {/* TODO: enable when the PDF "carpeta del trámite" exists (docs/planes/guia-de-tramites.md). */}
          <ul className={listVariants()}>
            <li>
              <button type="button" disabled aria-disabled className={cx(listRowVariants(), "cursor-not-allowed opacity-60")}>
                <RiFileDownloadLine className="size-5 shrink-0 text-text-link" aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body-medium text-text-link">Bajar la carpeta del trámite</span>
                  <span className="text-caption-1-regular text-text-secondary">Pronto</span>
                </span>
              </button>
            </li>
          </ul>
          <p className="text-caption-1-regular text-text-tertiary">Verificado el {formatDate(block.verified)}</p>
        </>
      );
    case "fee":
      return <FeeView fee={block.fee} />;
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
