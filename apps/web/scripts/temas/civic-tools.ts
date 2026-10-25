/**
 * Data for the two citizen tools: the request letter (/pedir) and the posters (/cartel). Small JSON built from what the
 * site already shows, so those pages don't download the municipality pages or the budgets.
 */
import { letterTargetId, municipalityName, singleBody } from "../../src/features/request-letter/utils/targets.ts";
import { TRANSPARENCY_ITEMS } from "../../src/transparency-items.ts";
import type {
  MunicipalBudget,
  MunicipioPagina,
  NoPublicado,
  PosterMunicipality,
  RequestTarget,
  TransparencyStatus,
} from "../../src/types.ts";

const PROVINCIAL_FORM = "https://ticketsform.mendoza.gov.ar/ticketsform/servlet/responderformulario?AIP_SOLICITUDINFORMACIONPUBLICA";

const NOT_PUBLISHED = new Set<TransparencyStatus>(["missing", "unreadable"]);
const STATUS_LABEL: Record<TransparencyStatus, string> = {
  current: "Lo publica",
  late: "Lo publica atrasado",
  undated: "Lo publica",
  unreadable: "No se puede leer",
  missing: "No lo publica",
};

export function buildRequestTargets(municipios: MunicipioPagina[], noPublicado: NoPublicado[]): RequestTarget[] {
  const towns: RequestTarget[] = municipios
    .filter((m) => m.transparency)
    .map((m) => {
      const items = m.transparency!.items;
      const channel = items.find((i) => i.id === "acceso_informacion");
      const online = channel && !NOT_PUBLISHED.has(channel.status) && channel.url ? channel.url : null;
      return {
        id: `muni-${m.slug}`,
        label: `Municipalidad de ${m.nombre}`,
        group: "Municipios",
        municipal: true,
        city: m.nombre === "Capital" ? "Mendoza" : m.nombre,
        where: online ? "en su canal de acceso a la información o en mesa de entradas" : "en mesa de entradas: no tiene un canal en línea",
        formUrl: online,
        documents: items.map((i) => ({
          id: i.id,
          label: TRANSPARENCY_ITEMS[i.id].label,
          text: TRANSPARENCY_ITEMS[i.id].request,
          missing: NOT_PUBLISHED.has(i.status),
          status: STATUS_LABEL[i.status],
        })),
      };
    });
  const bodies = new Map<string, RequestTarget>();
  for (const item of noPublicado.filter(singleBody)) {
    const id = letterTargetId(item);
    if (municipalityName(item.organismo)) {
      towns
        .find((t) => t.id === id)
        ?.documents.push({ id: item.id, label: item.titulo, text: item.pedido, missing: true, status: "No lo publica" });
      continue;
    }
    const target = bodies.get(id) ?? {
      id,
      label: item.organismo,
      group: "Gobierno de Mendoza",
      municipal: false,
      city: "Mendoza",
      where: item.formulario?.startsWith("mailto:")
        ? `por correo a ${item.formulario.slice("mailto:".length)} o en mesa de entradas`
        : "en el formulario oficial de la Ley 9070 o en mesa de entradas",
      formUrl: item.formulario ?? PROVINCIAL_FORM,
      documents: [],
    };
    target.documents.push({ id: item.id, label: item.titulo, text: item.pedido, missing: true, status: null });
    bodies.set(id, target);
  }
  return [...towns, ...[...bodies.values()].sort((a, b) => a.label.localeCompare(b.label, "es"))];
}

export function buildPosters(municipios: MunicipioPagina[], budgets: MunicipalBudget[]): PosterMunicipality[] {
  const bySlug = new Map(budgets.map((b) => [b.slug, b]));
  return municipios
    .filter((m) => m.transparency)
    .map((m) => {
      const year = bySlug.get(m.slug)?.years[0];
      return {
        slug: m.slug,
        name: m.nombre,
        checked: m.transparency!.checked,
        site: m.transparency!.site,
        items: m.transparency!.items.map((i) => ({ id: i.id, status: i.status })),
        published: m.transparency!.published,
        coparticipation: m.coparticipacion
          ? {
              year: m.coparticipacion.anio,
              reference: m.coparticipacion.referencia,
              total: m.coparticipacion.real,
              perCapita: m.coparticipacion.perCapita,
            }
          : null,
        staff: m.staff
          ? { quarter: m.staff.quarter, positions: m.staff.positions, contracts: m.staff.contracts, perThousand: m.staff.perThousand }
          : null,
        spending:
          year && year.accrued > 0 && year.byObject.length
            ? {
                year: year.year,
                cutoff: year.cutoff,
                accrued: year.accrued,
                top: [...year.byObject]
                  .sort((a, b) => b.accrued - a.accrued)
                  .slice(0, 4)
                  .map((o) => ({ name: o.name, accrued: o.accrued })),
              }
            : null,
      };
    });
}
