import { Alert } from "@mt/ui/components/alert";
import { Button } from "@mt/ui/components/base/buttons/button";
import { cardVariants, listRowVariants, listVariants } from "@mt/ui/components/card";
import { PageHeader, Section } from "@mt/ui/components/section";
import { cx } from "@mt/ui/lib/cx";
import { RiArrowRightSLine, RiExternalLinkLine, RiMoneyDollarCircleLine } from "@remixicon/react";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { WithBreadcrumbs } from "@/components/breadcrumbs.tsx";
import { ListSearch } from "@/components/list-search.tsx";
import { FuentesOficiales } from "@/components/official-sources.tsx";
import { ShareButton } from "@/components/share-button.tsx";
import { TrackedSheet } from "@/components/tracked-sheet.tsx";
import { inPesos, periodLabel, periodSentence, pesos } from "@/features/procedures/utils/format.ts";
import { formatDate, formatNumber, normalizeText } from "@/lib.ts";
import type { FeeRow } from "@/types.ts";
import { useUrlText } from "@/url-state.ts";

const route = getRouteApi("/municipios/$slug/tasas");
const PAGE = 40;
const LINK = "inline-flex min-h-11 items-center gap-1 text-text-link hover:underline sm:min-h-0";

/** /municipios/<slug>/tasas: the trade fee of every activity in the municipality's tarifaria, with its norm. */
export function MunicipalFeesPage() {
  const fees = route.useLoaderData();
  const { slug } = route.useParams();
  const [q, setQ] = useUrlText("q");
  const [open, setOpen] = useUrlText("rubro");
  const [shown, setShown] = useState(PAGE);
  const rows = fees?.rows;
  const visible = useMemo(() => {
    if (!rows) return [];
    const words = normalizeText(q).split(/\s+/).filter(Boolean);
    if (words.length === 0) return rows;
    return rows.filter((r) => {
      const hay = normalizeText(`${r.name} ${r.code} ${r.group}`);
      return words.every((w) => hay.includes(w));
    });
  }, [rows, q]);

  if (!fees || !rows) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-title-1-semibold tracking-tight">Todavía no leímos la tarifaria de este municipio</h1>
        <Link to="/municipios/$slug" params={{ slug }} className="w-fit text-text-link hover:underline">
          Volver al municipio ›
        </Link>
      </div>
    );
  }

  const fee = { unit: fees.unit, unitValue: fees.unitValue };
  const selected: FeeRow | undefined = open !== "" ? rows[Number(open)] : undefined;
  const period = periodLabel(fees.period);
  return (
    <div className="flex flex-col gap-8">
      <WithBreadcrumbs
        items={[
          { label: "Municipios", to: "/municipios" },
          { label: fees.name, to: `/municipios/${slug}` },
        ]}
        current={{ label: `Tasas ${fees.year}`, icon: RiMoneyDollarCircleLine }}
      >
        <PageHeader action={<ShareButton />} title={`Tasa de comercio de ${fees.name}, ${fees.year}`}>
          Cuánto cobra la Municipalidad de {fees.name} por el derecho de comercio, rubro por rubro, según su ordenanza tarifaria{" "}
          {fees.ordinance.number}.
        </PageHeader>
      </WithBreadcrumbs>

      <Alert variant="note" title="Cómo leer los montos">
        {!fees.period && fees.note?.includes("no aclara") ? "" : `${periodSentence(fees.period)} `}
        {fees.unit !== "pesos" && fees.unitValue
          ? `La ordenanza fija los montos en ${fees.unit}; los pasamos a pesos con la ${fees.unit} a ${pesos(fees.unitValue)}${fees.unitRule ? ` (${fees.unitRule})` : ""}. `
          : ""}
        {fees.note ?? ""}
      </Alert>

      {fees.highlights.length > 0 && (
        <Section id="rubros-comunes" title="Rubros comunes">
          <p className="-mt-2 max-w-2xl text-body-regular text-text-tertiary text-pretty">
            El monto va de la categoría más barata a la más cara; el municipio decide en cuál queda cada comercio.
          </p>
          <ul className={listVariants()}>
            {fees.highlights.map((h) => (
              <li key={h.name} className={cx(listRowVariants({ interactive: false }), "justify-between gap-4")}>
                <span className="min-w-0 truncate text-body-regular text-text-primary">{h.name}</span>
                <span className="shrink-0 text-body-medium whitespace-nowrap tabular-nums">
                  {pesos(h.min)} a {pesos(h.max)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section id="rubros" title="Todos los rubros">
        <ListSearch
          value={q}
          onChange={(v) => {
            setQ(v);
            setShown(PAGE);
          }}
          placeholder="Buscar un rubro, por ejemplo «kiosco» o «peluquería»"
          label="Buscar rubro de la tarifaria"
        />
        <p className="text-body-regular text-text-tertiary">
          {formatNumber(visible.length)} {visible.length === 1 ? "rubro" : "rubros"}
          {period ? ` · montos ${period}` : ""}
        </p>
        {visible.length === 0 ? (
          <p className="text-body-regular text-text-secondary">
            No encontramos ese rubro en la tarifaria. Probá con otra palabra: la ordenanza usa nombres como «Almacenes y despensas».
          </p>
        ) : (
          <ul className={listVariants()}>
            {visible.slice(0, shown).map((r) => {
              const values = r.amounts.map(([, a]) => inPesos(a, fee));
              return (
                <li key={`${r.code}-${r.name}-${r.type}`}>
                  <button type="button" className={cx(listRowVariants(), "min-h-16")} onClick={() => setOpen(String(rows.indexOf(r)))}>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-body-medium text-text-link" title={r.name}>
                        {r.name}
                      </span>
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-body-regular text-text-tertiary">
                          {r.group ? `${r.group} · ` : ""}código {r.code}
                        </span>
                        <span className="shrink-0 text-body-medium whitespace-nowrap tabular-nums">
                          {r.amounts.length > 1 ? `desde ${pesos(Math.min(...values))}` : pesos(values[0]!)}
                        </span>
                      </span>
                    </span>
                    <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {shown < visible.length && (
          <Button variant="secondary" className="w-fit" onClick={() => setShown((n) => n + PAGE)}>
            Ver más
          </Button>
        )}
      </Section>

      <Section id="norma" title="La norma">
        <a
          href={fees.ordinance.href}
          target="_blank"
          rel="noreferrer"
          className={cx(cardVariants(), "flex items-center justify-between gap-3")}
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-body-medium text-text-link">Ordenanza tarifaria {fees.ordinance.number}</span>
            <span className="text-caption-1-regular text-text-secondary">
              {fees.rule}
              {fees.ordinance.bulletinDate ? `, publicada en el Boletín Oficial el ${formatDate(fees.ordinance.bulletinDate)}` : ""}
            </span>
          </span>
          <RiExternalLinkLine className="size-5 shrink-0 text-text-link" aria-hidden />
        </a>
        <p className="text-caption-1-regular text-text-tertiary">Verificado el {formatDate(fees.verified)}.</p>
        <div className="flex flex-wrap gap-x-6">
          <Link to="/municipios/$slug/tramites/abrir-un-comercio" params={{ slug }} className={LINK}>
            Los pasos para abrir un comercio en {fees.name} ›
          </Link>
          <Link to="/tramites/abrir-un-comercio" className={LINK}>
            Abrir un comercio en toda Mendoza ›
          </Link>
        </div>
      </Section>

      <FuentesOficiales ids={["tributos"]} />

      {selected && (
        <TrackedSheet title={selected.name} trackId="municipality.fees.item" onClose={() => setOpen(null)}>
          <div className="flex flex-col gap-4">
            <p className="text-body-regular text-text-secondary text-pretty">
              {selected.group ? `${selected.group}. ` : ""}Código {selected.code} del anexo. La categoría la asigna el municipio.
            </p>
            <ul className={listVariants()}>
              {selected.amounts.map(([category, amount]) => (
                <li key={category} className={cx(listRowVariants({ interactive: false }), "justify-between gap-4")}>
                  <span className="text-body-regular text-text-primary">Categoría {category}</span>
                  <span className="flex flex-col items-end">
                    <span className="text-body-medium whitespace-nowrap tabular-nums">{pesos(inPesos(amount, fee))}</span>
                    {fees.unit !== "pesos" && (
                      <span className="text-caption-1-regular whitespace-nowrap text-text-tertiary tabular-nums">
                        {formatNumber(amount)} {fees.unit}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-caption-1-regular text-text-tertiary">
              {period ? `Montos ${period}. ` : ""}Página {selected.page} del texto de la ordenanza con sus anexos.
            </p>
          </div>
        </TrackedSheet>
      )}
    </div>
  );
}
