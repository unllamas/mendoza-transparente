/**
 * Home guide: the pieces that help people find their way in the site. Global search, department picker,
 * starting questions, the map of everything there is, how to read the data and what is new.
 * Data: temas/guia.json and data/search.json (scripts/temas/guide.ts).
 */

import { PersonAvatar } from "@mt/ui/components/avatar";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  Building2,
  Database,
  LayoutGrid,
  Store,
  ChevronRight,
  Coins,
  EyeOff,
  Landmark,
  type LucideIcon,
  MapPin,
  Scale,
  Search,
  ShieldCheck,
  ShoppingCart,
  UsersRound,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { track } from "../analytics.ts";
import { formatNumber } from "../lib.ts";
import { SECCION_ELECTORAL, slug } from "../slug.ts";
import type { HomeGuide, SearchEntry } from "../types.ts";

/** "¿Dónde vivís?" → the municipality page. */
export function DepartmentPicker() {
  const navigate = useNavigate();
  const names = Object.keys(SECCION_ELECTORAL).sort((a, b) => a.localeCompare(b, "es"));
  return (
    <label className="flex min-w-0 items-center gap-2 text-sm text-ink-2">
      <MapPin className="size-4 shrink-0 text-ink-muted" aria-hidden />
      <span className="whitespace-nowrap">¿Dónde vivís?</span>
      <select
        id="selector-departamento"
        defaultValue=""
        onChange={(e) => {
          if (!e.target.value) return;
          track("home.department.select", { municipality: e.target.value });
          void navigate({ to: "/municipios/$slug", params: { slug: e.target.value } });
        }}
        className="min-w-0 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-link"
      >
        <option value="">Elegí tu departamento</option>
        {names.map((n) => (
          <option key={n} value={slug(n)}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}

// ------------------------------------------------------------------ starting questions

export function StartingQuestions({ guide }: { guide: HomeGuide }) {
  const { facts, counts } = guide;
  const questions: { id: string; icon: LucideIcon; question: string; fact: string; to: string }[] = [
    { id: "municipio", icon: MapPin, question: "¿Quién gobierna mi departamento?", fact: `Intendente, legisladores, habitantes y coparticipación de los ${counts.municipalities}.`, to: "/municipios" },
    { id: "deuda", icon: Landmark, question: "¿Cuánto debe Mendoza y a quién?", fact: facts.debt ?? "Bonos, préstamos y acreedores.", to: "/deuda" },
    { id: "compras", icon: ShoppingCart, question: "¿A quién le compra el Estado?", fact: facts.topSupplier ?? "Las empresas y cada contrato.", to: "/proveedores" },
    { id: "leyes", icon: Scale, question: "¿Qué leyes se aprobaron?", fact: facts.latestLaw ?? `${counts.laws} leyes, explicadas en simple.`, to: "/leyes" },
    { id: "personal", icon: UsersRound, question: "¿Cuánta gente trabaja en el Estado y cuánto cuesta?", fact: facts.staff ?? "Cargos y costo de cada organismo.", to: "/gobierno" },
    { id: "no-publicado", icon: EyeOff, question: "¿Qué datos no se publican y cómo los pido?", fact: `${counts.missing} datos que deberían ser públicos, con el pedido listo.`, to: "/no-publicado" },
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
            className="group flex h-full flex-col gap-3 rounded-2xl border border-line bg-surface p-5 hover:border-link"
          >
            <Icon className="size-6 text-ink-muted group-hover:text-link" aria-hidden />
            <span className="text-lg font-semibold tracking-tight text-balance group-hover:text-link">{question}</span>
            <span className="text-sm text-ink-2 text-pretty">{fact}</span>
            <span className="mt-auto inline-flex items-center gap-1 pt-1 text-sm font-medium text-link">
              Ver la respuesta <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
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
  const groups: { title: string; description: string; icon: LucideIcon; items: { label: string; count?: number; to: string }[] }[] = [
    {
      title: "Quién gobierna",
      description: "Las personas y los organismos que deciden.",
      icon: UsersRound,
      items: [
        { label: "Funcionarios", count: c.officials, to: "/funcionarios" },
        { label: "Organismos", count: c.agencies, to: "/gobierno" },
        { label: "Municipios", count: c.municipalities, to: "/municipios" },
      ],
    },
    {
      title: "En qué se gasta",
      description: "De dónde sale la plata y a dónde va.",
      icon: Coins,
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
      icon: Scale,
      items: [
        { label: "Leyes", count: c.laws, to: "/leyes" },
        { label: "Designaciones", count: c.appointments, to: "/gobierno" },
        { label: "Para mirar de cerca", to: "/senales" },
      ],
    },
    {
      title: "Qué falta",
      description: "Lo que no se publica y cómo pedirlo.",
      icon: EyeOff,
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
        <section key={title} className="flex min-w-0 flex-col gap-3 rounded-2xl bg-tile p-4" aria-label={title}>
          <div className="flex items-start gap-2.5">
            <Icon className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden />
            <span className="flex min-w-0 flex-col">
              <span className="font-semibold">{title}</span>
              <span className="text-sm text-ink-muted">{description}</span>
            </span>
          </div>
          <ul className="flex flex-col divide-y divide-line/60">
            {items.map((i) => (
              <li key={i.label}>
                <Link
                  to={i.to}
                  data-track="home.map.open"
                  data-track-section={i.to}
                  className="group flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-grid/60"
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-link group-hover:underline">{i.label}</span>
                  {i.count !== undefined && <span className="shrink-0 text-sm tabular-nums text-ink-muted">{formatNumber(i.count)}</span>}
                  <ChevronRight className="size-4 shrink-0 text-link" aria-hidden />
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

export const READING_RULES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: ShieldCheck, title: "Cada número tiene su fuente", text: "Todo dato enlaza al sitio oficial del que sale y a una copia guardada, por si después lo borran." },
  { icon: Scale, title: "Señales, no acusaciones", text: "Marcamos patrones que merecen una explicación. Cada organismo puede tener una razón válida." },
  { icon: Coins, title: "Pesos de hoy", text: "Para comparar años distintos, pasamos los montos a pesos de hoy con la inflación oficial." },
  { icon: Building2, title: "La misma vara para todos", text: "La misma metodología para todos los gobiernos y partidos, y el código abierto para revisarla." },
];

export function ReadingRules() {
  return (
    <div className="flex flex-col gap-4">
      <ul className="grid gap-4 rounded-2xl bg-tile p-5 sm:grid-cols-2">
        {READING_RULES.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex items-start gap-3">
            <Icon className="mt-0.5 size-5 shrink-0 text-ink-2" aria-hidden />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">{title}</span>
              <span className="text-sm text-ink-2 text-pretty">{text}</span>
            </span>
          </li>
        ))}
      </ul>
      <Link
        to="/como-leer"
        id="home-como-leer"
        data-track="home.reading_guide.open"
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-link hover:underline"
      >
        <BookOpen className="size-4" aria-hidden /> Guía para empezar y glosario de términos <ArrowRight className="size-4" aria-hidden />
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
    <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl bg-tile">
      {guide.news.map((n) => (
        <li key={`${n.href}-${n.date}-${n.title}`}>
          <Link
            to={n.href}
            data-track="home.news.open"
            data-track-kind={n.kind}
            className="group flex items-center gap-3 px-4 py-3 hover:bg-grid/50 sm:gap-4 sm:px-5"
          >
            <span className="hidden w-14 shrink-0 text-sm whitespace-nowrap text-ink-muted tabular-nums sm:block">{shortDate(n.date)}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <span className="flex items-center gap-2">
                <span className="w-fit shrink-0 rounded bg-grid px-1.5 py-0.5 text-[11px] font-medium text-ink-2">{n.kind}</span>
                <span className="text-xs whitespace-nowrap text-ink-muted tabular-nums sm:hidden">{shortDate(n.date)}</span>
              </span>
              <span className="line-clamp-2 group-hover:text-link sm:line-clamp-1">{n.title}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-link" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

