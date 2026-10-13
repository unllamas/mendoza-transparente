import { cn } from "@mt/ui/lib/utils";
import { buttonVariants } from "@mt/ui/components/button";
import { PageHeader, Section } from "@mt/ui/components/section";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Bug, Compass, MousePointerClick, Search, ShieldCheck } from "lucide-react";

import { GLOSSARY } from "../glossary.ts";
import { openSearch } from "../search.tsx";
import { Migas } from "./components.tsx";
import { READING_RULES } from "./home-guide.tsx";

const STEPS = [
  {
    icon: Search,
    title: "Buscá lo que te interesa",
    text: "Tocá la lupa (arriba, en cualquier página) y escribí el nombre de un funcionario, una ley, una empresa o tu departamento.",
  },
  {
    icon: Compass,
    title: "O empezá por una pregunta",
    text: "¿Quién gobierna mi departamento? ¿A quién le compra el Estado? Cada pregunta te lleva a la respuesta con los datos.",
  },
  {
    icon: MousePointerClick,
    title: "Seguí los links",
    text: "Todo está conectado: de un intendente a su municipio, de un organismo a lo que compra, de una empresa a sus contratos.",
  },
  {
    icon: ShieldCheck,
    title: "Verificá la fuente",
    text: "Debajo de cada dato está el sitio oficial del que sale y una copia guardada. Si algo no te cierra, revisalo vos.",
  },
];

export function ComoLeerPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-12">
      <Migas items={[{ label: "Cómo leer estos datos" }]} />
      <PageHeader icon={BookOpen} topic="Guía" title="Para qué sirve Mendoza Transparente y cómo usarlo">
        Reunimos los datos públicos de la provincia de Mendoza, que están dispersos en decenas de sitios oficiales, PDF y
        planillas, y los ordenamos para que cualquier persona pueda entender en qué se gasta la plata, quién decide y qué falta
        publicar. Es un proyecto ciudadano, independiente y apartidario.
      </PageHeader>

      <Section title="Cómo empezar">
        <ol className="grid gap-3 sm:grid-cols-2">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="flex items-start gap-3 rounded-2xl bg-tile p-4">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-grid text-sm font-semibold tabular-nums">
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex items-center gap-2 font-medium">
                  <Icon className="size-4 shrink-0 text-ink-muted" aria-hidden /> {title}
                </span>
                <span className="text-sm text-ink-2 text-pretty">{text}</span>
              </span>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => openSearch("guide")}
          className={cn(buttonVariants({ variant: "primary" }), "w-fit")}
        >
          Abrir el buscador <ArrowRight className="size-4" aria-hidden />
        </button>
      </Section>

      <Section title="Reglas para leer los datos">
        <ul className="flex flex-col gap-4">
          {READING_RULES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-start gap-3">
              <Icon className="mt-0.5 size-5 shrink-0 text-ink-2" aria-hidden />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{title}</span>
                <span className="text-ink-2 text-pretty">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Glosario">
        <p className="-mt-2 text-sm text-ink-muted">Los términos que más confunden, explicados en simple.</p>
        <dl className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl bg-tile">
          {GLOSSARY.map((g) => (
            <div key={g.id} id={g.id} className="flex scroll-mt-20 flex-col gap-1.5 px-4 py-4 sm:px-5">
              <dt className="font-semibold">{g.term}</dt>
              <dd className="text-ink-2 text-pretty">{g.definition}</dd>
              {g.seeAlso && (
                <dd>
                  <Link to={g.seeAlso.to} className="inline-flex items-center gap-1 text-sm text-link hover:underline">
                    {g.seeAlso.label} <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </dd>
              )}
            </div>
          ))}
        </dl>
      </Section>

      <Section title="¿Algo no se entiende o encontraste un error?">
        <p className="-mt-2 text-ink-2 text-pretty">Avisanos: lo revisamos y lo corregimos. También podés sugerir datos que falten.</p>
        <Link
          to="/participar"
          search={{ tipo: "error", pagina: "/como-leer" }}
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-link hover:underline"
        >
          <Bug className="size-4" aria-hidden /> Escribinos
        </Link>
      </Section>
    </div>
  );
}
