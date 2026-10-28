import { Chip } from "@mt/ui/components/base/badges/chip";
import { listRowVariants, listVariants } from "@mt/ui/components/card";
import { Section } from "@mt/ui/components/section";
import { cx } from "@mt/ui/lib/cx";
import { RiExternalLinkLine } from "@remixicon/react";

import { formatDate } from "@/lib.ts";
import type { NotPublished, ProcedureStep } from "@/types.ts";
import { notPublishedSentence, WHEN_LABEL } from "../utils/format.ts";

const LINK = "inline-flex min-h-11 items-center gap-1 text-text-link hover:underline sm:min-h-0";

/** Steps of a procedure: who asks for it, what it is, the official page it comes from and when we checked it. */
export function StepList({ steps }: { steps: ProcedureStep[] }) {
  return (
    <ol className={listVariants()}>
      {steps.map((s) => (
        <li key={`${s.agency}-${s.title}`} className={cx(listRowVariants({ interactive: false }), "flex-col items-start gap-1.5 py-4")}>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-body-medium text-text-primary text-pretty">{s.title}</span>
            {WHEN_LABEL[s.when] && <Chip variant="caption">{WHEN_LABEL[s.when]}</Chip>}
          </span>
          <span className="text-caption-1-regular text-text-tertiary">{s.agency}</span>
          <span className="text-body-regular text-text-secondary text-pretty">{s.detail}</span>
          <span className="flex flex-wrap items-center gap-x-4 text-body-regular">
            <a href={s.href} target="_blank" rel="noreferrer" className={LINK}>
              Fuente oficial <RiExternalLinkLine className="size-3.5" aria-hidden />
            </a>
            <span className="text-caption-1-regular text-text-tertiary">Verificado el {formatDate(s.verified)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** What the organisms do not publish, as «<organismo> no publica …»: a gap in the official information, not a guess. */
export function NotPublishedSection({ items, title = "Lo que no se publica" }: { items: NotPublished[]; title?: string }) {
  if (items.length === 0) return null;
  return (
    <Section id="no-publica" title={title}>
      <ul className={listVariants()}>
        {items.map((n) => (
          <li key={`${n.agency}-${n.what}`} className={cx(listRowVariants({ interactive: false }), "flex-col items-start gap-1")}>
            <span className="text-body-medium text-text-primary text-pretty">{notPublishedSentence(n)}</span>
            {n.detail && <span className="text-body-regular text-text-secondary text-pretty">{n.detail}</span>}
          </li>
        ))}
      </ul>
    </Section>
  );
}
