import { Button } from "@mt/ui/components/base/buttons/button";
import { listRowVariants, listVariants, tileVariants } from "@mt/ui/components/card";
import { PageHeader, Section } from "@mt/ui/components/section";
import { cx } from "@mt/ui/lib/cx";
import {
  RiArrowRightLine,
  RiBookOpenLine,
  RiBugLine,
  RiCompassLine,
  RiCursorLine,
  RiSearchLine,
  RiShieldCheckLine,
} from "@remixicon/react";
import { Link } from "@tanstack/react-router";
import { Breadcrumbs } from "@/components/breadcrumbs.tsx";
import { READING_RULES } from "@/components/home-guide.tsx";
import { openSearch } from "@/components/search-dialog.tsx";
import { GLOSSARY } from "@/glossary.ts";

const STEPS = [
  {
    icon: RiSearchLine,
    title: "Buscá lo que te interesa",
    text: "Tocá la lupa (arriba, en cualquier página) y escribí el nombre de un funcionario, una ley, una empresa o tu departamento.",
  },
  {
    icon: RiCompassLine,
    title: "O empezá por una pregunta",
    text: "¿Quién gobierna mi departamento? ¿A quién le compra el Estado? Cada pregunta te lleva a la respuesta con los datos.",
  },
  {
    icon: RiCursorLine,
    title: "Seguí los links",
    text: "Todo está conectado: de un intendente a su municipio, de un organismo a lo que compra, de una empresa a sus contratos.",
  },
  {
    icon: RiShieldCheckLine,
    title: "Verificá la fuente",
    text: "Debajo de cada dato está el sitio oficial del que sale y una copia guardada. Si algo no te cierra, revisalo vos.",
  },
];

export function ComoLeerPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-12">
      <Breadcrumbs items={[{ label: "Cómo leer estos datos" }]} />
      <PageHeader icon={RiBookOpenLine} topic="Guía" title="Para qué sirve Mendoza Transparente y cómo usarlo">
        Reunimos los datos públicos de la provincia de Mendoza, que están dispersos en decenas de sitios oficiales, PDF y planillas, y los
        ordenamos para que cualquier persona pueda entender en qué se gasta la plata, quién decide y qué falta publicar. Es un proyecto
        ciudadano, independiente y apartidario.
      </PageHeader>

      <Section title="Cómo empezar">
        <ol className="grid gap-3 sm:grid-cols-2">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className={cx(tileVariants(), "flex items-start gap-3")}>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-chart-grid text-body-semibold tabular-nums">
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex items-center gap-2 font-medium">
                  <Icon className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden /> {title}
                </span>
                <span className="text-body-regular text-text-secondary text-pretty">{text}</span>
              </span>
            </li>
          ))}
        </ol>
        <Button className="w-fit" onClick={() => openSearch("guide")} trailingIcon={RiArrowRightLine}>
          Abrir el buscador
        </Button>
      </Section>

      <Section title="Reglas para leer los datos">
        <ul className="flex flex-col gap-4">
          {READING_RULES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-start gap-3">
              <Icon className="mt-0.5 size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{title}</span>
                <span className="text-text-secondary text-pretty">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Glosario">
        <p className="-mt-2 text-body-regular text-text-tertiary">Los términos que más confunden, explicados en simple.</p>
        <dl className={listVariants()}>
          {GLOSSARY.map((g) => (
            <div
              key={g.id}
              id={g.id}
              className={cx(listRowVariants({ interactive: false }), "scroll-mt-20 flex-col items-stretch gap-1.5")}
            >
              <dt className="font-semibold">{g.term}</dt>
              <dd className="text-text-secondary text-pretty">{g.definition}</dd>
              {g.seeAlso && (
                <dd>
                  <Link to={g.seeAlso.to} className="inline-flex items-center gap-1 text-body-regular text-text-link hover:underline">
                    {g.seeAlso.label} <RiArrowRightLine className="size-3.5" aria-hidden />
                  </Link>
                </dd>
              )}
            </div>
          ))}
        </dl>
      </Section>

      <Section title="¿Algo no se entiende o encontraste un error?">
        <p className="-mt-2 text-text-secondary text-pretty">
          Avisanos: lo revisamos y lo corregimos. También podés sugerir datos que falten.
        </p>
        <Link
          to="/participar"
          search={{ tipo: "error", pagina: "/como-leer" }}
          className="inline-flex w-fit items-center gap-2 text-body-medium text-text-link hover:underline"
        >
          <RiBugLine className="size-4" aria-hidden /> Escribinos
        </Link>
      </Section>
    </div>
  );
}
