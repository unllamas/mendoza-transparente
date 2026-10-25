import { buttonClassName } from "@mt/ui/components/base/buttons/button";
import { listRowVariants, listVariants } from "@mt/ui/components/card";
import { Section } from "@mt/ui/components/section";
import { StatusBadge } from "@mt/ui/components/status-badge";
import { cx } from "@mt/ui/lib/cx";
import { RiArrowRightSLine, RiArrowRightUpLine } from "@remixicon/react";
import { Link } from "@tanstack/react-router";

import { TrackedSheet } from "@/components/tracked-sheet.tsx";
import { formatDate, formatNumber } from "@/lib.ts";
import type { MunicipalTransparency, TransparencyItem, TransparencyItemId, TransparencyStatus } from "@/types.ts";
import { useUrlText } from "@/url-state.ts";

/** What each item is and why it matters, in the words a neighbor would use. */
const ITEMS: Record<TransparencyItemId, { label: string; what: string; law: string }> = {
  presupuesto: {
    label: "Presupuesto del año",
    what: "Cuánta plata piensa gastar el municipio en el año y en qué.",
    law: "Ley 7314 de Responsabilidad Fiscal",
  },
  ejecucion: {
    label: "Ejecución del gasto",
    what: "Cuánto gastó de verdad, trimestre a trimestre (anexos 2 a 5 de Responsabilidad Fiscal).",
    law: "Ley 7314 de Responsabilidad Fiscal",
  },
  personal: {
    label: "Personal y contratos",
    what: "Cuántos cargos de planta y contratos tiene y cuánto se pagó (anexo 19 de Responsabilidad Fiscal).",
    law: "Ley 7314 de Responsabilidad Fiscal",
  },
  deuda: {
    label: "Deuda",
    what: "Cuánto debe el municipio y a quién, trimestre a trimestre.",
    law: "Ley 7314 de Responsabilidad Fiscal",
  },
  compras: {
    label: "Compras y licitaciones",
    what: "Qué compra el municipio, a quién y por cuánto.",
    law: "Ley 9070 de Acceso a la Información Pública",
  },
  normas: {
    label: "Decretos y ordenanzas",
    what: "Las decisiones del intendente y del Concejo Deliberante, publicadas en un boletín o digesto.",
    law: "Ley 9070 de Acceso a la Información Pública",
  },
  sueldos: {
    label: "Sueldos de las autoridades",
    what: "Cuánto cobran el intendente y sus secretarios.",
    law: "Ley 9070 de Acceso a la Información Pública",
  },
  declaraciones_juradas: {
    label: "Declaraciones juradas",
    what: "El patrimonio que declaran el intendente y los funcionarios.",
    law: "Ley 8993 de Ética Pública",
  },
  acceso_informacion: {
    label: "Canal para pedir información",
    what: "Un formulario, un correo o un área donde cualquier vecino puede pedir información pública.",
    law: "Ley 9070 de Acceso a la Información Pública",
  },
};

/** Entry of data/curado/no-publicado.yaml with the request ready to file, when there is one for the item. */
const REQUEST: Partial<Record<TransparencyItemId, string>> = {
  presupuesto: "municipios-sin-datos",
  personal: "personal-godoy-cruz-las-heras",
  sueldos: "sueldos-autoridades-municipales",
  acceso_informacion: "acceso-informacion-municipal",
};

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
export function MunicipalTransparencySection({ name, data }: { name: string; data: MunicipalTransparency }) {
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

      {open && <ItemSheet item={open} name={name} searched={data.searched} site={data.site} onClose={() => setOpenId(null)} />}
    </Section>
  );
}

function ItemSheet({
  item,
  name,
  searched,
  site,
  onClose,
}: {
  item: TransparencyItem;
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
              to="/no-publicado"
              search={{ dato: (missing && REQUEST[item.id]) || undefined } as never}
              data-track="municipality.transparency_request.open"
              data-track-item={item.id}
              className={cx(buttonClassName({ variant: "secondary" }), "w-fit")}
            >
              {missing && REQUEST[item.id] ? "Pedir este dato" : "Ver cómo pedir información pública"}
            </Link>
          </div>
        )}
      </div>
    </TrackedSheet>
  );
}
