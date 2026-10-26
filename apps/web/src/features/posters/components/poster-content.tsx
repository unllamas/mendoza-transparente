import { cx } from "@mt/ui/lib/cx";
import { RiBankLine, RiCheckLine, RiCloseLine, RiEyeLine, RiGroupLine, RiQuestionLine, RiShoppingBagLine } from "@remixicon/react";
import { formatDate, formatNumber } from "@/lib.ts";
import { TRANSPARENCY_ITEMS } from "@/transparency-items.ts";
import type { PosterMunicipality, TransparencyItemId } from "@/types.ts";
import type { PosterContent } from "./poster-view.tsx";

export const POSTER_TOPICS = ["publica", "falta", "plata", "gasto", "empleo"] as const;
export type PosterTopic = (typeof POSTER_TOPICS)[number];

/** The question each missing item becomes on a poster. */
const MISSING_QUESTION: Partial<Record<TransparencyItemId, string>> = {
  presupuesto: "¿Cuánto piensa gastar el municipio este año?",
  ejecucion: "¿En qué gastó el municipio este año?",
  personal: "¿Cuántos empleados tiene el municipio?",
  deuda: "¿Cuánto debe el municipio, y a quién?",
  compras: "¿Qué compra el municipio, a quién y por cuánto?",
  normas: "¿Qué decide el intendente y qué vota el Concejo?",
  sueldos: "¿Cuánto cobran el intendente y sus secretarios?",
  declaraciones_juradas: "¿Qué patrimonio declaran el intendente y sus secretarios?",
  acceso_informacion: "¿Dónde se le pide información al municipio?",
};

const millions = (v: number) => `$ ${formatNumber(Math.round(v / 1e6))}`;
const pesos = (v: number) => `$ ${formatNumber(Math.round(v))}`;
const isMissing = (status: string) => status === "missing" || status === "unreadable";

export const missingItems = (m: PosterMunicipality) => m.items.filter((i) => isMissing(i.status));

/** The municipality's own item behind each topic that comes from it, to tell why its figures are missing. */
const TOPIC_ITEM: Partial<Record<PosterTopic, TransparencyItemId>> = { gasto: "ejecucion", empleo: "personal" };

const FORMAT_NAME: Record<string, string> = {
  pdf: "en PDF",
  pdf_escaneado: "en PDF escaneado",
  planilla: "en planillas",
  zip: "en archivos comprimidos",
};

/** Why a topic has no figures: the municipality does not publish it ("missing"), or it does and it is not read yet ("elsewhere"). */
function gap(m: PosterMunicipality, topic: PosterTopic) {
  const item = m.items.find((i) => i.id === TOPIC_ITEM[topic]);
  return item && isMissing(item.status) ? ({ kind: "missing", id: item.id } as const) : ({ kind: "elsewhere", item } as const);
}

/** Every topic, for every municipality: when the figures are missing, the poster asks for them instead. */
export function posterTopics(m: PosterMunicipality) {
  const total = m.items.length;
  const hint = (topic: PosterTopic, withData: string) => {
    const has = { plata: m.coparticipation, gasto: m.spending, empleo: m.staff }[topic as "plata" | "gasto" | "empleo"];
    if (has) return withData;
    const g = gap(m, topic);
    if (g.kind === "missing") return "No lo publica: con un QR para pedirlo";
    const format = g.item?.format ? FORMAT_NAME[g.item.format] : undefined;
    return `Lo publica${format ? ` ${format}` : ""}: con un QR para verlo`;
  };
  return [
    {
      value: "publica" as const,
      label: "Qué publica",
      description: `${m.published} de ${total} datos que piden las leyes`,
      icon: RiEyeLine,
    },
    {
      value: "falta" as const,
      label: "Un dato que no publica",
      description: missingItems(m).length ? "Con un QR para pedirlo" : `Publica los ${total}: con un QR para pedir más`,
      icon: RiQuestionLine,
    },
    {
      value: "plata" as const,
      label: "Plata de la Provincia",
      description: hint("plata", "Cuánto recibió de coparticipación"),
      icon: RiBankLine,
    },
    {
      value: "gasto" as const,
      label: "En qué gasta",
      description: hint("gasto", "Cuánto va a cada cosa, en pesos y en %"),
      icon: RiShoppingBagLine,
    },
    { value: "empleo" as const, label: "Empleados", description: hint("empleo", "Cuántas personas trabajan"), icon: RiGroupLine },
  ];
}

/** A poster that asks for an item the municipality does not publish. */
function missingPoster(m: PosterMunicipality, id: TransparencyItemId, origin: string): PosterContent {
  const unreadable = m.items.find((i) => i.id === id)?.status === "unreadable";
  return {
    kicker: m.name,
    question: MISSING_QUESTION[id] ?? TRANSPARENCY_ITEMS[id].label,
    sentence: `${unreadable ? "La Municipalidad lo publica de una forma que no se puede leer." : "La Municipalidad no lo publica."} Cualquier persona puede pedirlo, gratis y sin explicar para qué: tienen 15 días hábiles para responder.`,
    qrUrl: `${origin}/pedir?para=muni-${m.slug}&dato=${id}`,
    qrLabel: "Pedilo en dos minutos",
    source: `${unreadable ? "Revisado en" : "No lo encontramos en"} ${m.site ? new URL(m.site).hostname.replace(/^www\./, "") : "el sitio oficial"} al ${formatDate(m.checked)}.`,
  };
}

/** "A missing item" for a municipality that publishes them all: anyone can still ask for more. */
function allPublishedPoster(m: PosterMunicipality, origin: string): PosterContent {
  return {
    kicker: m.name,
    question: `¿Qué dato no publica la Municipalidad de ${m.name}?`,
    figure: "Ninguno",
    unit: `de los ${m.items.length} que piden las leyes`,
    sentence:
      "Publica todos. Igual, cualquier persona puede pedir más información, gratis y sin explicar para qué: tienen 15 días hábiles para responder.",
    qrUrl: `${origin}/pedir?para=muni-${m.slug}`,
    qrLabel: "Pedí información",
    source: `Relevamiento de Mendoza Transparente en el sitio oficial, ${formatDate(m.checked)}.`,
  };
}

/** A poster for a topic without figures: it asks for them, or points to what the municipality publishes and is not read yet. */
function gapPoster(m: PosterMunicipality, topic: PosterTopic, question: string, origin: string): PosterContent {
  const g = gap(m, topic);
  if (g.kind === "missing") return { ...missingPoster(m, g.id, origin), question };
  const format = g.item?.format ? FORMAT_NAME[g.item.format] : undefined;
  return {
    kicker: m.name,
    question,
    sentence: `La Municipalidad lo publica${format ? ` ${format}` : ""}, pero todavía no lo pasamos a números que se puedan comparar. Con el QR lo ves en el sitio oficial.`,
    qrUrl: g.item?.url ?? m.site ?? `${origin}/municipios/${m.slug}`,
    qrLabel: "Miralo en el sitio oficial",
    source: `Relevamiento de Mendoza Transparente en el sitio oficial, ${formatDate(m.checked)}.`,
  };
}

/** The poster for a topic. The QR goes to the letter when something is missing, to the municipality's page otherwise. */
export function posterContent(m: PosterMunicipality, topic: PosterTopic, missingId: TransparencyItemId, origin: string): PosterContent {
  const kicker = m.name;
  const page = `${origin}/municipios/${m.slug}`;
  const checked = formatDate(m.checked);
  const missing = missingItems(m);
  switch (topic) {
    case "falta":
      return missing.length ? missingPoster(m, missingId, origin) : allPublishedPoster(m, origin);
    case "plata": {
      const c = m.coparticipation;
      if (!c) return gapPoster(m, topic, `¿Cuánta plata recibió ${m.name} de la Provincia?`, origin);
      return {
        kicker,
        question: `¿Cuánta plata recibió ${m.name} de la Provincia en ${c.year}?`,
        figure: millions(c.total),
        unit: "millones",
        sentence: `Son ${pesos(c.perCapita)} por cada vecino. Es la coparticipación: la parte de los impuestos que la Provincia reparte entre los municipios. En pesos de ${c.reference}.`,
        qrUrl: page,
        qrLabel: "Mirá en qué se gasta",
        source: `Ministerio de Hacienda y Finanzas de Mendoza, participación municipal ${c.year}.`,
      };
    }
    case "gasto": {
      const s = m.spending;
      if (!s) return gapPoster(m, topic, `¿En qué gasta ${m.name}?`, origin);
      return {
        kicker,
        question: `¿En qué gastó ${m.name} en ${s.year}?`,
        figure: millions(s.accrued),
        unit: "millones",
        sentence: `Lo gastado hasta ${s.cutoff}, en millones de pesos y en % del total:`,
        body: (
          <ul className="flex flex-col gap-[1.6cqw]">
            {s.top.map((o) => {
              const share = Math.round((o.accrued / s.accrued) * 100);
              return (
                <li key={o.name} className="flex flex-col gap-[0.8cqw]">
                  <span className="flex justify-between gap-[2cqw]">
                    <span className="truncate">{o.name}</span>
                    <span className="shrink-0 whitespace-nowrap tabular-nums">
                      <span className="text-neutral-500">{millions(o.accrued)}</span>
                      <span className="ml-[1.6cqw] font-semibold">{share} %</span>
                    </span>
                  </span>
                  <span className="h-[1.8cqw] rounded-full bg-neutral-100">
                    <span className="block h-full rounded-full bg-accent-500" style={{ width: `${share}%` }} />
                  </span>
                </li>
              );
            })}
          </ul>
        ),
        qrUrl: page,
        qrLabel: "Mirá el detalle",
        source: `Ejecución presupuestaria que publica la Municipalidad (Ley 7314), hasta ${s.cutoff}.`,
      };
    }
    case "empleo": {
      const s = m.staff;
      if (!s) return gapPoster(m, topic, `¿Cuántas personas trabajan en la Municipalidad de ${m.name}?`, origin);
      return {
        kicker,
        question: `¿Cuántas personas trabajan en la Municipalidad de ${m.name}?`,
        figure: formatNumber(s.positions + s.contracts),
        unit: "cargos y contratos",
        sentence: `${formatNumber(s.positions)} cargos de planta y ${formatNumber(s.contracts)} contratos: unos ${formatNumber(Math.round(s.perThousand))} cada 1.000 vecinos.`,
        qrUrl: page,
        qrLabel: "Mirá cómo cambió",
        source: `Anexo 19 de Responsabilidad Fiscal que publica la Municipalidad, ${s.quarter}.`,
      };
    }
    default:
      return {
        kicker,
        question: `¿Qué publica la Municipalidad de ${m.name}?`,
        figure: `${m.published} de ${m.items.length}`,
        unit: "datos que piden las leyes",
        body: (
          <ul className="flex flex-col divide-y divide-neutral-200 border-y border-neutral-200 text-[3.1cqw]">
            {m.items.map((i) => {
              const off = isMissing(i.status);
              return (
                <li key={i.id} className="flex items-center gap-[2.5cqw] py-[0.9cqw]">
                  {off ? (
                    <RiCloseLine className="size-[3.4cqw] shrink-0 text-neutral-500" aria-hidden />
                  ) : (
                    <RiCheckLine className="size-[3.4cqw] shrink-0 text-accent-600" aria-hidden />
                  )}
                  <span className={cx("min-w-0 flex-1 truncate", off && "font-semibold")}>{TRANSPARENCY_ITEMS[i.id].label}</span>
                  <span className={cx("shrink-0 text-[0.8em]", off ? "font-semibold" : "text-neutral-500")}>
                    {i.status === "unreadable" ? "No se puede leer" : off ? "No lo publica" : "Lo publica"}
                  </span>
                </li>
              );
            })}
          </ul>
        ),
        qrUrl: missing.length ? `${origin}/pedir?para=muni-${m.slug}` : page,
        qrLabel: missing.length ? "Pedí lo que falta" : "Mirá los datos",
        source: `Relevamiento de Mendoza Transparente en el sitio oficial, ${checked}.`,
      };
  }
}
