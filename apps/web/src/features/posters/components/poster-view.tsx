import { cx } from "@mt/ui/lib/cx";
import qrcode from "qrcode-generator";
import { type ReactNode, useMemo } from "react";

export type PosterFormat = "a4" | "square" | "story";

/** What a poster says. Its body (a checklist, bars) only fits the A4 and the story. */
export interface PosterContent {
  kicker: string;
  question: string;
  figure?: string;
  unit?: string;
  sentence?: string;
  body?: ReactNode;
  qrUrl: string;
  qrLabel: string;
  source: string;
}

/** Real QR code drawn as SVG squares, so it prints sharp at any size. */
function Qr({ url, className }: { url: string; className?: string }) {
  const cells = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    const n = qr.getModuleCount();
    return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
  }, [url]);
  const n = cells.length;
  return (
    <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} className={cx("bg-white", className)} role="img" aria-label={`Código QR a ${url}`}>
      {cells.flatMap((row, r) =>
        row.map((dark, c) => (dark ? <rect key={`${r}-${c}`} x={c} y={r} width={1.02} height={1.02} fill="#111" /> : null)),
      )}
    </svg>
  );
}

function Brand() {
  return (
    <span className="flex items-center gap-[1.5cqw] font-semibold text-neutral-900">
      <span className="flex h-[4cqw] w-[4cqw] flex-col overflow-hidden rounded-[0.8cqw]" aria-hidden>
        <span className="flex-1 bg-accent-400" />
        <span className="flex-1 bg-white" />
        <span className="flex-1 bg-accent-400" />
      </span>
      Mendoza Transparente
    </span>
  );
}

const ASPECT: Record<PosterFormat, string> = { a4: "aspect-[1/1.414]", square: "aspect-square", story: "aspect-[9/16]" };

/** Type sizes per format, in % of the poster's width (cqw): the same poster looks the same at any size and fits its format. */
const SIZE: Record<
  PosterFormat,
  { pad: string; gap: string; question: string; questionWithFigure: string; figure: string; sentence: string; qr: string }
> = {
  a4: {
    pad: "p-[7cqw]",
    gap: "mt-[6cqw]",
    question: "text-[9cqw]",
    questionWithFigure: "text-[6cqw]",
    figure: "text-[9cqw]",
    sentence: "text-[3.6cqw]",
    qr: "w-[20cqw]",
  },
  square: {
    pad: "p-[6cqw]",
    gap: "mt-[4cqw]",
    question: "text-[7cqw]",
    questionWithFigure: "text-[5cqw]",
    figure: "text-[9cqw]",
    sentence: "text-[3.2cqw]",
    qr: "w-[17cqw]",
  },
  story: {
    pad: "px-[7cqw] py-[12cqw]",
    gap: "my-auto",
    question: "text-[9.5cqw]",
    questionWithFigure: "text-[7cqw]",
    figure: "text-[13cqw]",
    sentence: "text-[4.2cqw]",
    qr: "w-[26cqw]",
  },
};

/** The poster. Light and plain on purpose: it has to print well in black and white. */
export function PosterView({ content: p, format }: { content: PosterContent; format: PosterFormat }) {
  const z = SIZE[format];
  return (
    <div className="@container w-full">
      <article className={cx("flex flex-col overflow-hidden bg-white text-[3.4cqw] leading-snug text-neutral-900", ASPECT[format], z.pad)}>
        <Brand />
        <div className={cx("flex flex-col", z.gap)}>
          <div className="flex flex-col gap-[2.5cqw]">
            <span className="text-[3.4cqw] font-semibold tracking-wide text-accent-700 uppercase">{p.kicker}</span>
            <h3 className={cx("leading-[1.05] font-bold tracking-tight text-balance", p.figure ? z.questionWithFigure : z.question)}>
              {p.question}
            </h3>
          </div>
          {p.figure && (
            <p className="mt-[3.5cqw] flex items-baseline gap-[2cqw]">
              <span className={cx("leading-none font-bold tracking-tight whitespace-nowrap text-accent-700 tabular-nums", z.figure)}>
                {p.figure}
              </span>
              <span className="text-[3.6cqw] text-neutral-600">{p.unit}</span>
            </p>
          )}
          {p.sentence && <p className={cx("mt-[3cqw] text-neutral-700 text-pretty", z.sentence)}>{p.sentence}</p>}
          {p.body && format !== "square" && <div className="mt-[4cqw]">{p.body}</div>}
        </div>
        <div className="mt-auto flex items-end justify-between gap-[4cqw] pt-[3cqw]">
          <div className="flex min-w-0 flex-col gap-[1.2cqw]">
            <span className="text-[4.2cqw] font-bold text-accent-700">{p.qrLabel}</span>
            <span className="text-[2.5cqw] text-neutral-500 text-pretty">{p.source}</span>
          </div>
          <Qr url={p.qrUrl} className={cx(z.qr, "shrink-0 rounded-[1.2cqw] ring-1 ring-neutral-200")} />
        </div>
      </article>
    </div>
  );
}
