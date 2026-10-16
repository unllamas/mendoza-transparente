import { PageHeader } from "@mt/ui/components/section";
import { RiFileList3Line } from "@remixicon/react";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { WithBreadcrumbs } from "@/components/breadcrumbs.tsx";
import { FuentesOficiales } from "@/components/official-sources.tsx";
import { TrackedSegmented } from "@/components/tracked-segmented.tsx";
import { BudgetYear } from "@/features/municipal-budget/components/budget-year.tsx";

const route = getRouteApi("/municipios/$slug/presupuesto/$anio");

export function MunicipalBudgetPage() {
  const budget = route.useLoaderData();
  const { slug, anio } = route.useParams();
  const navigate = useNavigate();
  const year = budget?.years.find((y) => String(y.year) === anio);

  if (!budget || !year) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-title-1-semibold tracking-tight">No tenemos ese presupuesto</h1>
        <p className="text-body-regular text-text-secondary">
          {budget
            ? `Para ${budget.name} tenemos los años ${budget.years.map((y) => y.year).join(", ")}.`
            : "Todavía no leímos los informes de presupuesto de este municipio."}
        </p>
        <Link to="/municipios/$slug" params={{ slug }} className="w-fit text-text-link hover:underline">
          Volver al municipio ›
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <WithBreadcrumbs
        items={[
          { label: "Municipios", to: "/municipios" },
          { label: budget.name, to: `/municipios/${slug}` },
          { label: `Presupuesto ${year.year}` },
        ]}
      >
        <PageHeader icon={RiFileList3Line} topic={`Municipalidad de ${budget.name}`} title={`Presupuesto ${year.year}`}>
          Cuánto aprobó el municipio, cuánto gastó y en qué, según los informes que publica cada trimestre por la Ley de Responsabilidad
          Fiscal.
        </PageHeader>
      </WithBreadcrumbs>

      {budget.years.length > 1 && (
        <TrackedSegmented
          label="Año"
          trackId="municipality.budget.year"
          value={String(year.year)}
          options={[...budget.years].reverse().map((y) => ({ value: String(y.year), label: String(y.year) }))}
          onChange={(value) => navigate({ to: "/municipios/$slug/presupuesto/$anio", params: { slug, anio: value } })}
        />
      )}

      <BudgetYear budget={budget} year={year} />

      <FuentesOficiales ids={["municipios-lrf", "deie-ipc", "poblacion"]} />
    </div>
  );
}
