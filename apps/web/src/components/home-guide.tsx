import { Chip } from "@mt/ui/components/base/badges/chip";
import { Select, SelectItem } from "@mt/ui/components/base/select/select";
import { cardVariants, listRowVariants, listVariants, tileVariants } from "@mt/ui/components/card";
import { cx } from "@mt/ui/lib/cx";
/**
 * Home guide: the pieces that help people find their way in the site. Global search, department picker,
 * starting questions, the map of everything there is, how to read the data and what is new.
 * Data: temas/guia.json and data/search.json (scripts/temas/guide.ts).
 */

import {
  type RemixiconComponentType,
  RiArrowRightLine,
  RiArrowRightSLine,
  RiBankLine,
  RiBookOpenLine,
  RiBuilding2Line,
  RiCoinsLine,
  RiEyeOffLine,
  RiMapPinLine,
  RiScales3Line,
  RiShieldCheckLine,
  RiShoppingCartLine,
  RiTeamLine,
} from "@remixicon/react";
import { Link, useNavigate } from "@tanstack/react-router";

import { track } from "@/analytics.ts";
import { formatNumber } from "@/lib.ts";
import { SECCION_ELECTORAL, slug } from "@/slug.ts";
import type { HomeGuide } from "@/types.ts";

/** "¿Dónde vivís?" → the municipality page. */
export function DepartmentPicker() {
  const navigate = useNavigate();
  const names = Object.keys(SECCION_ELECTORAL).sort((a, b) => a.localeCompare(b, "es"));
  return (
    <div className="flex min-w-0 items-center gap-2 text-body-regular text-text-secondary">
      <RiMapPinLine className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
      <span className="whitespace-nowrap" id="selector-departamento-label">
        ¿Dónde vivís?
      </span>
      <Select
        id="selector-departamento"
        aria-labelledby="selector-departamento-label"
        placeholder="Elegí tu departamento"
        onChange={(key) => {
          if (key == null) return;
          const municipality = String(key);
          track("home.department.select", { municipality });
          void navigate({ to: "/municipios/$slug", params: { slug: municipality } });
        }}
        className="min-w-0"
      >
        {names.map((n) => (
          <SelectItem key={n} id={slug(n)}>
            {n}
          </SelectItem>
        ))}
      </Select>
    </div>
  );
}

// ------------------------------------------------------------------ starting questions

export function StartingQuestions({ guide }: { guide: HomeGuide }) {
  const { facts, counts } = guide;
  const questions: { id: string; icon: RemixiconComponentType; question: string; fact: string; to: string }[] = [
    {
      id: "municipio",
      icon: RiMapPinLine,
      question: "¿Quién gobierna mi departamento?",
      fact: `Intendente, legisladores, habitantes y coparticipación de los ${counts.municipalities}.`,
      to: "/municipios",
    },
    {
      id: "deuda",
      icon: RiBankLine,
      question: "¿Cuánto debe Mendoza y a quién?",
      fact: facts.debt ?? "Bonos, préstamos y acreedores.",
      to: "/deuda",
    },
    {
      id: "compras",
      icon: RiShoppingCartLine,
      question: "¿A quién le compra el Estado?",
      fact: facts.topSupplier ?? "Las empresas y cada contrato.",
      to: "/proveedores",
    },
    {
      id: "leyes",
      icon: RiScales3Line,
      question: "¿Qué leyes se aprobaron?",
      fact: facts.latestLaw ?? `${counts.laws} leyes, explicadas en simple.`,
      to: "/leyes",
    },
    {
      id: "personal",
      icon: RiTeamLine,
      question: "¿Cuánta gente trabaja en el Estado y cuánto cuesta?",
      fact: facts.staff ?? "Cargos y costo de cada organismo.",
      to: "/gobierno",
    },
    {
      id: "no-publicado",
      icon: RiEyeOffLine,
      question: "¿Qué datos no se publican y cómo los pido?",
      fact: `${counts.missing} datos que deberían ser públicos, con el pedido listo.`,
      to: "/no-publicado",
    },
  ];
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {questions.map(({ id, icon: Icon, question, fact, to }) => (
        <li key={id} className="min-w-0">
          <Link
            to={to}
            id={`pregunta-${id}`}
            data-track="home.question.open"
            data-track-question={id}
            className={cx(cardVariants({ size: "lg" }), "flex h-full flex-col gap-3")}
          >
            <Icon className="size-6 text-foreground-icon-secondary group-hover:text-text-link" aria-hidden />
            <span className="text-title-3-semibold tracking-tight text-balance group-hover:text-text-link">{question}</span>
            <span className="text-body-regular text-text-secondary text-pretty">{fact}</span>
            <span className="mt-auto inline-flex items-center gap-1 pt-1 text-body-medium text-text-link">
              Ver la respuesta <RiArrowRightLine className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ map of everything

export function EcosystemMap({ guide }: { guide: HomeGuide }) {
  const c = guide.counts;
  const groups: {
    title: string;
    description: string;
    icon: RemixiconComponentType;
    items: { label: string; count?: number; to: string }[];
  }[] = [
    {
      title: "Quién gobierna",
      description: "Las personas y los organismos que deciden.",
      icon: RiTeamLine,
      items: [
        { label: "Funcionarios", count: c.officials, to: "/funcionarios" },
        { label: "Organismos", count: c.agencies, to: "/gobierno" },
        { label: "Municipios", count: c.municipalities, to: "/municipios" },
      ],
    },
    {
      title: "En qué se gasta",
      description: "De dónde sale la plata y a dónde va.",
      icon: RiCoinsLine,
      items: [
        { label: "Deuda pública", to: "/deuda" },
        { label: "Coparticipación", to: "/coparticipacion" },
        { label: "Proveedores", count: c.suppliers, to: "/proveedores" },
        { label: "Áreas que compran", count: c.buyers, to: "/organismos" },
        { label: "Empleo público", to: "/empleo-publico" },
      ],
    },
    {
      title: "Qué se decide",
      description: "Las normas y los nombramientos.",
      icon: RiScales3Line,
      items: [
        { label: "Leyes", count: c.laws, to: "/leyes" },
        { label: "Designaciones", count: c.appointments, to: "/gobierno" },
        { label: "Para mirar de cerca", to: "/senales" },
      ],
    },
    {
      title: "Qué falta",
      description: "Lo que no se publica y cómo pedirlo.",
      icon: RiEyeOffLine,
      items: [
        { label: "Lo que no se publica", count: c.missing, to: "/no-publicado" },
        { label: "Registrá tu pedido", to: "/participar" },
        { label: "Fuentes oficiales", count: c.sources, to: "/fuentes" },
      ],
    },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {groups.map(({ title, description, icon: Icon, items }) => (
        <section key={title} className={cx(tileVariants(), "flex min-w-0 flex-col gap-3")} aria-label={title}>
          <div className="flex items-start gap-2.5">
            <Icon className="mt-0.5 size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
            <span className="flex min-w-0 flex-col">
              <span className="font-semibold">{title}</span>
              <span className="text-body-regular text-text-tertiary">{description}</span>
            </span>
          </div>
          <ul className="flex flex-col divide-y divide-separator-border/60">
            {items.map((i) => (
              <li key={i.label}>
                <Link
                  to={i.to}
                  data-track="home.map.open"
                  data-track-section={i.to}
                  className="group flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-chart-grid/60"
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-text-link group-hover:underline">{i.label}</span>
                  {i.count !== undefined && (
                    <span className="shrink-0 text-body-regular tabular-nums text-text-tertiary">{formatNumber(i.count)}</span>
                  )}
                  <RiArrowRightSLine className="size-4 shrink-0 text-text-link" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ how to read the data

export const READING_RULES: { icon: RemixiconComponentType; title: string; text: string }[] = [
  {
    icon: RiShieldCheckLine,
    title: "Cada número tiene su fuente",
    text: "Todo dato enlaza al sitio oficial del que sale y a una copia guardada, por si después lo borran.",
  },
  {
    icon: RiScales3Line,
    title: "Señales, no acusaciones",
    text: "Marcamos patrones que merecen una explicación. Cada organismo puede tener una razón válida.",
  },
  {
    icon: RiCoinsLine,
    title: "Pesos de hoy",
    text: "Para comparar años distintos, pasamos los montos a pesos de hoy con la inflación oficial.",
  },
  {
    icon: RiBuilding2Line,
    title: "La misma vara para todos",
    text: "La misma metodología para todos los gobiernos y partidos, y el código abierto para revisarla.",
  },
];

export function ReadingRules() {
  return (
    <div className="flex flex-col gap-4">
      <ul className={cx(tileVariants({ size: "lg" }), "grid gap-4 sm:grid-cols-2")}>
        {READING_RULES.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex items-start gap-3">
            <Icon className="mt-0.5 size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">{title}</span>
              <span className="text-body-regular text-text-secondary text-pretty">{text}</span>
            </span>
          </li>
        ))}
      </ul>
      <Link
        to="/como-leer"
        id="home-como-leer"
        data-track="home.reading_guide.open"
        className="inline-flex w-fit items-center gap-2 text-body-medium text-text-link hover:underline"
      >
        <RiBookOpenLine className="size-4" aria-hidden /> Guía para empezar y glosario de términos{" "}
        <RiArrowRightLine className="size-4" aria-hidden />
      </Link>
    </div>
  );
}

// ------------------------------------------------------------------ what is new

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

export function WhatsNew({ guide }: { guide: HomeGuide }) {
  if (!guide.news.length) return null;
  return (
    <ul className={listVariants()}>
      {guide.news.map((n) => (
        <li key={`${n.href}-${n.date}-${n.title}`}>
          <Link to={n.href} data-track="home.news.open" data-track-kind={n.kind} className={cx(listRowVariants(), "sm:gap-4")}>
            <span className="hidden w-14 shrink-0 text-body-regular whitespace-nowrap text-text-tertiary tabular-nums sm:block">
              {shortDate(n.date)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <span className="flex items-center gap-2">
                <Chip variant="caption" color="soft" className="w-fit shrink-0">
                  {n.kind}
                </Chip>
                <span className="text-caption-1-regular whitespace-nowrap text-text-tertiary tabular-nums sm:hidden">
                  {shortDate(n.date)}
                </span>
              </span>
              <span className="line-clamp-2 group-hover:text-text-link sm:line-clamp-1">{n.title}</span>
            </span>
            <RiArrowRightSLine className="size-4 shrink-0 text-text-link" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
