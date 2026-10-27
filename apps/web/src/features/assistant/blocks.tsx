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
          {block.fee && (
            <p className="text-body-regular text-pretty text-text-primary">
              {block.fee.label}:{" "}
              <strong className="text-body-semibold">
                de $&nbsp;{formatNumber(block.fee.min)} a $&nbsp;{formatNumber(block.fee.max)}
              </strong>
              .{block.fee.note ? ` ${block.fee.note}` : ""}{" "}
              <a href={block.fee.source.href} target="_blank" rel="noreferrer" className="text-text-link hover:underline">
                {block.fee.source.label}
              </a>
            </p>
          )}
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
