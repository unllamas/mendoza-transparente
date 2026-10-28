import { Chip } from "@mt/ui/components/base/badges/chip";
import { cardVariants, listRowVariants, listVariants } from "@mt/ui/components/card";
import { PageHeader, Section } from "@mt/ui/components/section";
import { cx } from "@mt/ui/lib/cx";
import { RiArrowRightSLine, RiExternalLinkLine, RiStore2Line } from "@remixicon/react";
import { getRouteApi, Link } from "@tanstack/react-router";
import { WithBreadcrumbs } from "@/components/breadcrumbs.tsx";
import { FuentesOficiales } from "@/components/official-sources.tsx";
import { ShareButton } from "@/components/share-button.tsx";
import { NotPublishedSection, StepList } from "@/features/procedures/components/step-list.tsx";
import { inPesos, ONLINE_LABEL, periodLabel, pesos, rangeLabel } from "@/features/procedures/utils/format.ts";
import { formatDate } from "@/lib.ts";

const guideRoute = getRouteApi("/tramites/abrir-un-comercio");
const municipalRoute = getRouteApi("/municipios/$slug/tramites/abrir-un-comercio");

const LINK = "inline-flex min-h-11 items-center gap-1 text-text-link hover:underline sm:min-h-0";

/** /tramites/abrir-un-comercio: the steps of Nation and Province (the same everywhere) and how the municipalities compare. */
export function ProcedureGuidePage() {
  const guide = guideRoute.useLoaderData();
  if (!guide) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-title-1-semibold tracking-tight">Todavía no tenemos esta guía</h1>
        <Link to="/municipios" className="w-fit text-text-link hover:underline">
          Ver los municipios ›
        </Link>
      </div>
    );
  }
  const withFee = guide.municipalities.filter((m) => m.fee !== "none");
  return (
    <div className="flex flex-col gap-8">
      <WithBreadcrumbs items={[]} current={{ label: "Abrir un comercio", icon: RiStore2Line }}>
        <PageHeader action={<ShareButton />} title="Abrir un comercio en Mendoza">
          Los pasos de Nación y de la Provincia, que son los mismos en toda Mendoza, y cómo se compara cada municipio en lo que cambia: los
          pasos propios, si se inicia en línea y cuánto cobra por el derecho de comercio.
        </PageHeader>
      </WithBreadcrumbs>

      <Section id="nacion-y-provincia" title="Primero: Nación y Provincia">
        <p className="-mt-2 max-w-2xl text-body-regular text-text-tertiary text-pretty">
          Estos pasos no dependen del departamento donde está el local. Los del municipio vienen después.
        </p>
        <StepList steps={[...guide.national, ...guide.province]} />
      </Section>

      <NotPublishedSection items={guide.provinceNotPublished} title="Lo que Nación y Provincia no publican" />

      <Section id="municipios" title="Después: el municipio del local">
        <p className="-mt-2 max-w-2xl text-body-regular text-text-tertiary text-pretty">
          Revisamos {guide.municipalities.length} municipios, con la ficha oficial de cada uno. Cada tarjeta lleva a sus pasos, requisitos y
          costos.
        </p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {guide.municipalities.map((m) => (
            <li key={m.slug} className="flex">
              <Link
                to="/municipios/$slug/tramites/abrir-un-comercio"
                params={{ slug: m.slug }}
                className={cx(cardVariants(), "flex w-full flex-col gap-2")}
                data-track="procedure.municipality.open"
                data-track-municipality={m.name}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-body-medium text-text-link">{m.name}</span>
                  <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
                </span>
                <span className="text-body-regular text-text-secondary">
                  {m.ownSteps} {m.ownSteps === 1 ? "paso propio" : "pasos propios"} · {ONLINE_LABEL[m.online].toLowerCase()}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  <Chip variant="caption" color={m.online === "online" ? "brand" : "neutral"}>
                    {m.online === "online" ? "En línea" : m.online === "in_person" ? "En persona" : "Sin dato en línea"}
                  </Chip>
                  <Chip variant="caption" color={m.fee === "none" ? "warning" : "brand"}>
                    {m.fee === "table"
                      ? `Tasa ${m.feeYear} por rubro`
                      : m.fee === "examples"
                        ? `Tasa ${m.feeYear}: algunos rubros`
                        : "Sin monto publicado"}
                  </Chip>
                  {m.hasPromotion && <Chip variant="caption">Régimen de promoción</Chip>}
                </span>
                <span className="text-caption-1-regular text-text-tertiary">Verificado el {formatDate(m.verified)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="tasas" title="Cuánto cobra cada municipio por el derecho de comercio">
        <p className="-mt-2 max-w-2xl text-body-regular text-text-tertiary text-pretty">
          Es la tasa que se paga todos los años (o todos los meses, según el municipio) por tener el comercio. Depende del rubro y de la
          categoría que le asigna el municipio.
        </p>
        <ul className={listVariants()}>
          {withFee.map((m) =>
            m.fee === "table" ? (
              <li key={m.slug}>
                <Link
                  to="/municipios/$slug/tasas"
                  params={{ slug: m.slug }}
                  className={cx(listRowVariants(), "min-h-16")}
                  data-track="procedure.fees.open"
                  data-track-municipality={m.name}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-body-medium text-text-link">{m.name}</span>
                    <span className="truncate text-body-regular text-text-tertiary">
                      Todos los rubros, {m.feeYear}
                      {m.feeUnit !== "pesos" ? `, en ${m.feeUnit}` : ""}
                    </span>
                  </span>
                  <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
                </Link>
              </li>
            ) : (
              <li
                key={m.slug}
                className={cx(listRowVariants({ interactive: false }), "min-h-16 flex-col items-start justify-center gap-0.5")}
              >
                <span className="text-body-medium text-text-primary">{m.name}</span>
                <span className="text-body-regular text-text-tertiary">Montos de algunos rubros, en su página de trámite</span>
              </li>
            ),
          )}
        </ul>
      </Section>

      <FuentesOficiales ids={["tributos"]} />
    </div>
  );
}

/** /municipios/<slug>/tramites/abrir-un-comercio: what is specific to that municipality. */
export function MunicipalProcedurePage() {
  const procedure = municipalRoute.useLoaderData();
  const { slug } = municipalRoute.useParams();
  if (!procedure) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-title-1-semibold tracking-tight">Todavía no tenemos este trámite en este municipio</h1>
        <Link to="/tramites/abrir-un-comercio" className="w-fit text-text-link hover:underline">
          Ver la guía para toda Mendoza ›
        </Link>
      </div>
    );
  }
  const fee = procedure.fee;
  return (
    <div className="flex flex-col gap-8">
      <WithBreadcrumbs
        items={[
          { label: "Municipios", to: "/municipios" },
          { label: procedure.name, to: `/municipios/${slug}` },
        ]}
        current={{ label: "Abrir un comercio", icon: RiStore2Line }}
      >
        <PageHeader action={<ShareButton />} title={`Abrir un comercio en ${procedure.name}`}>
          Los pasos, los requisitos y los costos que pone el municipio, según su ficha oficial verificada el{" "}
          {formatDate(procedure.verified)}. Los pasos de Nación y de la Provincia están en la{" "}
          <Link to="/tramites/abrir-un-comercio" className="text-text-link hover:underline">
            guía para toda Mendoza
          </Link>
          .
        </PageHeader>
      </WithBreadcrumbs>

      <Section id="pasos" title={`Pasos en ${procedure.name}`}>
        <StepList steps={procedure.steps} />
      </Section>

      <Section id="costos" title="Cuánto cuesta">
        {fee.table && (
          <Link
            to="/municipios/$slug/tasas"
            params={{ slug }}
            className={cx(cardVariants(), "flex items-center justify-between gap-3")}
            data-track="municipality.fees.open"
            data-track-municipality={procedure.name}
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-body-medium text-text-link">Derecho de comercio por rubro, {fee.year}</span>
              <span className="text-caption-1-regular text-text-secondary">Buscá tu rubro en la tarifaria completa</span>
            </span>
            <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
          </Link>
        )}
        {fee.examples.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-body-medium text-text-primary">Algunos rubros, {fee.year}</h3>
            <ul className={listVariants()}>
              {fee.examples.map((e) => (
                <li key={e.name} className={cx(listRowVariants({ interactive: false }), "justify-between gap-4")}>
                  <span className="min-w-0 truncate text-body-regular text-text-primary">{e.name}</span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="text-body-medium whitespace-nowrap tabular-nums">
                      {pesos(inPesos(e.min, fee))} a {pesos(inPesos(e.max, fee))}
                    </span>
                    {fee.unit !== "pesos" && (
                      <span className="text-caption-1-regular whitespace-nowrap text-text-tertiary tabular-nums">
                        {rangeLabel(e.min, e.max, fee.unit)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {fee.available && (fee.table || fee.examples.length > 0) && (
          <p className="max-w-2xl text-body-regular text-text-secondary text-pretty">
            {periodLabel(fee.period)
              ? `Los montos son ${periodLabel(fee.period)}. `
              : fee.note?.includes("no aclara")
                ? ""
                : "La ordenanza no aclara si los montos son mensuales o anuales. "}
            {fee.unit !== "pesos" && fee.unitValue
              ? `En pesos con la ${fee.unit} a ${pesos(fee.unitValue)}${fee.unitRule ? ` (${fee.unitRule})` : ""}. `
              : ""}
            {fee.note ?? ""}
          </p>
        )}
        {!fee.available && <p className="max-w-2xl text-body-regular text-text-secondary text-pretty">{fee.note}</p>}
        <ul className={listVariants()}>
          {procedure.costs.map((c) => (
            <li key={c.concept} className={cx(listRowVariants({ interactive: false }), "flex-col items-start gap-1 py-4")}>
              <span className="text-body-medium text-text-primary text-pretty">{c.concept}</span>
              <span className="text-body-regular text-text-secondary text-pretty">{c.detail}</span>
              {c.rule && (
                <span className="text-caption-1-regular text-text-tertiary">
                  {c.href ? (
                    <a href={c.href} target="_blank" rel="noreferrer" className={LINK}>
                      {c.rule} <RiExternalLinkLine className="size-3.5" aria-hidden />
                    </a>
                  ) : (
                    c.rule
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Section>

      {procedure.promotion && (
        <Section id="promocion" title="Régimen de promoción">
          <div
            className={cx(
              listRowVariants({ interactive: false }),
              "flex-col items-start gap-1 rounded-xl border border-border-button-default py-4",
            )}
          >
            <span className="text-body-regular text-text-secondary text-pretty">{procedure.promotion.detail}</span>
            {procedure.promotion.href ? (
              <a href={procedure.promotion.href} target="_blank" rel="noreferrer" className={LINK}>
                {procedure.promotion.rule} <RiExternalLinkLine className="size-3.5" aria-hidden />
              </a>
            ) : (
              <span className="text-caption-1-regular text-text-tertiary">{procedure.promotion.rule}</span>
            )}
          </div>
        </Section>
      )}

      <NotPublishedSection items={procedure.notPublished} title={`Lo que ${procedure.name} no publica`} />

      <FuentesOficiales ids={["tributos"]} />
    </div>
  );
}
