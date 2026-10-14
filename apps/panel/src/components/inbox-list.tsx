import titles from "virtual:item-titles";
import { Chip } from "@mt/ui/components/base/badges/chip";
import { StatusBadge } from "@mt/ui/components/status-badge";
import { cx } from "@mt/ui/lib/cx";
import { RiErrorWarningLine, RiEyeLine } from "@remixicon/react";
import { useEffect, useRef } from "react";
import type { InboxItem } from "../api.ts";
import { REVIEW_DOT, REVIEW_LABELS, shortWhen, TYPE_LABELS } from "../labels.ts";

/** What the row is about, in one line: the item requested, or the start of the message. */
export const itemHeadline = (i: Pick<InboxItem, "type" | "itemId" | "preview">) =>
  i.type === "request" && i.itemId && i.itemId !== "otro" ? (titles[i.itemId] ?? i.itemId) : i.preview;

export function InboxList({
  items,
  selected,
  onSelect,
}: {
  items: InboxItem[];
  selected: string | null;
  onSelect: (code: string) => void;
}) {
  const list = useRef<HTMLUListElement>(null);
  // Moving with j/k keeps the selected row in view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the selection changes, read from the DOM
  useEffect(() => {
    list.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  return (
    <ul ref={list} className="flex flex-col divide-y divide-separator-border">
      {items.map((i) => (
        <li key={i.code}>
          <button
            type="button"
            aria-current={i.code === selected}
            onClick={() => onSelect(i.code)}
            className={cx(
              "flex w-full min-w-0 flex-col gap-1.5 px-4 py-3 text-start hover:bg-background-interactive focus-visible:bg-background-interactive",
              i.code === selected && "bg-background-interactive",
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-body-medium">{i.context ?? TYPE_LABELS[i.type]}</span>
              <span className="shrink-0 whitespace-nowrap font-mono text-caption-1-regular text-text-tertiary">
                {shortWhen(i.createdAt)}
              </span>
            </span>
            <span className="line-clamp-2 text-body-regular text-text-secondary">{itemHeadline(i)}</span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono text-caption-1-regular text-text-tertiary">{i.code}</span>
              <Chip variant="caption" color="soft">
                {TYPE_LABELS[i.type]}
              </Chip>
              <StatusBadge status={REVIEW_DOT[i.reviewStatus]} label={REVIEW_LABELS[i.reviewStatus]} className="text-caption-1-regular" />
              {i.isPublic && (
                <Chip variant="caption" color="brand">
                  <RiEyeLine aria-hidden /> Publicado
                </Chip>
              )}
              {i.overdue && (
                <Chip variant="caption" color="warning">
                  <RiErrorWarningLine aria-hidden /> Vencido
                </Chip>
              )}
              {i.pendingAnswers > 0 && (
                <Chip variant="caption" color="warning">
                  <RiErrorWarningLine aria-hidden />{" "}
                  {i.pendingAnswers === 1 ? "1 respuesta para revisar" : `${i.pendingAnswers} respuestas para revisar`}
                </Chip>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
