import { buttonClassName } from "@mt/ui/components/base/buttons/button";
import { listRowVariants, listVariants } from "@mt/ui/components/card";
import { Section } from "@mt/ui/components/section";
import { StatusBadge } from "@mt/ui/components/status-badge";
import { cx } from "@mt/ui/lib/cx";
import { RiArrowRightSLine, RiArrowRightUpLine } from "@remixicon/react";
import { Link } from "@tanstack/react-router";

import { TrackedSheet } from "@/components/tracked-sheet.tsx";
import { formatDate, formatNumber } from "@/lib.ts";
import { TRANSPARENCY_ITEMS as ITEMS } from "@/transparency-items.ts";
import type { MunicipalTransparency, TransparencyItem, TransparencyItemId, TransparencyStatus } from "@/types.ts";
import { useUrlText } from "@/url-state.ts";

const STATUS: Record<TransparencyStatus, { status: "good" | "warning" | "critical"; label: string }> = {
  current: { status: "good", label: "Al día" },
  late: { status: "warning", label: "Atrasado" },
  undated: { status: "good", label: "Lo publica" },
  unreadable: { status: "warning", label: "No se puede leer" },
  missing: { status: "critical", label: "No lo publica" },
};

const FORMAT: Record<NonNullable<TransparencyItem["format"]>, string> = {
  planilla: "Planilla",
  pdf: "PDF",
  pdf_escaneado: "PDF escaneado",
  web: "Página web",
  zip: "ZIP",
};

const QUARTERLY = new Set<TransparencyItemId>(["ejecucion", "personal", "deuda"]);
const YEARLY = new Set<TransparencyItemId>(["presupuesto", "declaraciones_juradas"]);

/** "2026-06-30" → "2.º trim. 2026" for quarterly annexes, "2026" for yearly items, the date for the rest. */
function period(item: TransparencyItem): string | null {
  if (!item.latest) return null;
  const year = item.latest.slice(0, 4);
  if (YEARLY.has(item.id)) return year;
  if (QUARTERLY.has(item.id)) return `${Math.ceil(Number(item.latest.slice(5, 7)) / 3)}.º trim. ${year}`;
  return formatDate(item.latest);
}

function detail(item: TransparencyItem): string {
  if (item.status === "missing") return "";
  const p = period(item);
  return [p, item.format && FORMAT[item.format]].filter(Boolean).join(" · ");
}

/** "Qué publica el municipio": the checklist of what the law asks it to publish, with the link to check each one. */
export function MunicipalTransparencySection({ slug, name, data }: { slug: string; name: string; data: MunicipalTransparency }) {
  const [openId, setOpenId] = useUrlText("publica");
  const open = data.items.find((i) => i.id === openId);
  const total = data.items.length;
  return (
    <Section id="que-publica" title="Qué publica el municipio">
      <p className="-mt-2 text-body-regular text-text-tertiary">
        Lo que las leyes le piden publicar a {name} y lo que encontramos en su sitio: publica {data.published} de {total} ({data.current} al
        día). El promedio de los 18 municipios es {formatNumber(data.average)}. Revisado el {formatDate(data.checked)}.
      </p>
      <ul className={listVariants()}>
        {data.items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              id={`publica-${item.id}`}
              onClick={() => setOpenId(item.id)}
              data-track="municipality.transparency_item.open"
              data-track-item={item.id}
              data-track-status={item.status}
              className={cx(listRowVariants(), "gap-4")}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium group-hover:text-text-link">{ITEMS[item.id].label}</span>
                <span className="flex min-w-0 items-center gap-1.5 text-body-regular text-text-tertiary">
                  <StatusBadge {...STATUS[item.status]} className="shrink-0 whitespace-nowrap" />
                  {detail(item) && <span className="line-clamp-2">· {detail(item)}</span>}
                </span>
              </span>
              <RiArrowRightSLine className="size-4 shrink-0 text-text-link" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      <Link
        to="/cartel"
        search={{ municipio: slug }}
        id="municipio-hacer-cartel"
        data-track="municipality.poster.open"
        data-track-municipality={slug}
        className="inline-flex min-h-11 w-fit items-center gap-1 text-body-medium text-text-link hover:underline"
      >
        Hacé un cartel con estos datos <RiArrowRightSLine className="size-4" aria-hidden />
      </Link>

      {open && <ItemSheet item={open} slug={slug} name={name} searched={data.searched} site={data.site} onClose={() => setOpenId(null)} />}
    </Section>
  );
}

function ItemSheet({
  item,
  slug,
  name,
  searched,
  site,
  onClose,
}: {
  item: TransparencyItem;
  slug: string;
  name: string;
  searched: string[];
  site: string | null;
  onClose: () => void;
}) {
  const info = ITEMS[item.id];
  const p = period(item);
  const missing = item.status === "missing";
  // Where we looked for this item, or the municipality's pages when the survey has none for it.
  const looked = item.url ? [item.url] : searched.slice(0, 3);
  return (
    <TrackedSheet title={info.label} onClose={onClose} trackId="municipality.transparency_item">
      <div className="flex flex-col gap-5">
        <StatusBadge {...STATUS[item.status]} />
        <p className="text-body-regular text-text-secondary">
          {info.what} Lo pide la {info.law}.
        </p>
        {!missing && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body-regular">
            <dt className="text-text-tertiary">Último dato</dt>
            <dd className="min-w-0">{p ?? "No se ve la fecha"}</dd>
            <dt className="text-text-tertiary">Formato</dt>
            <dd className="min-w-0">{item.format ? FORMAT[item.format] : "—"}</dd>
          </dl>
        )}
        {item.note && <p className="text-body-regular text-text-secondary">{item.note}</p>}
        {item.url && !missing ? (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            data-track="municipality.transparency_source.open"
            data-track-item={item.id}
            className={cx(buttonClassName({ variant: "secondary" }), "w-fit")}
          >
            Abrir en el sitio del municipio <RiArrowRightUpLine className="size-5" aria-hidden />
          </a>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-body-regular text-text-secondary">
              {missing ? `No lo encontramos${site ? ` en el sitio de ${name}` : ""}.` : "No tenemos el link directo."} Cualquier vecino
              puede pedirlo y el municipio está obligado a responder.
            </p>
            {missing && looked.length > 0 && (
              <div className="flex flex-col gap-1 text-body-regular">
                <span className="text-text-tertiary">Dónde buscamos</span>
                <ul className="flex flex-col gap-1">
                  {looked.map((u) => (
                    <li key={u} className="truncate">
                      <a href={u} target="_blank" rel="noreferrer" className="text-text-link hover:underline">
                        {u.replace(/^https?:\/\//, "")}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Link
              to="/pedir"
              search={{ para: `muni-${slug}`, dato: item.id }}
              id="publica-armar-nota"
              data-track="municipality.transparency_request.open"
              data-track-item={item.id}
              className={cx(buttonClassName({ variant: missing ? "primary" : "secondary" }), "w-fit")}
            >
              Armar la nota para pedirlo
            </Link>
          </div>
        )}
      </div>
    </TrackedSheet>
  );
}
