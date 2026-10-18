import { Alert } from "@mt/ui/components/alert";
import { listRowVariants, listVariants, tileVariants } from "@mt/ui/components/card";
import { PageHeader, Section } from "@mt/ui/components/section";
import { StatTile } from "@mt/ui/components/stat-tile";
import { cx } from "@mt/ui/lib/cx";
import { RiCalendarLine, RiReceiptLine, RiUserLine } from "@remixicon/react";
import { getRouteApi, Link } from "@tanstack/react-router";
import { formatMoneda } from "@/celdas.ts";
import { BarList } from "@/charts/bar-list.tsx";
import { ColumnChart } from "@/charts/column-chart.tsx";
import { Term } from "@/components/glossary-term.tsx";
import { FuentesOficiales } from "@/components/official-sources.tsx";
import { ShareButton } from "@/components/share-button.tsx";
import { StaleDataAlert } from "@/components/stale-data-alert.tsx";
import { formatNumber } from "@/lib.ts";

const route = getRouteApi("/recaudacion");

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const pesos = (v: number) => `$ ${formatNumber(Math.round(v))}`;
const millones = (v: number) => formatMoneda(v, "ARS");
/** A trillion pesos ("billón" in Spanish) for the yearly total, so it fits on one line. */
const billones = (v: number) => `$ ${(v / 1e12).toLocaleString("es-AR", { maximumFractionDigits: 2 })} billones`;
const variacion = (actual: number, anterior: number) => {
  const pct = ((actual - anterior) / anterior) * 100;
  const abs = Math.abs(pct).toLocaleString("es-AR", { maximumFractionDigits: 1 });
  return pct >= 0.05 ? `+${abs} %` : pct <= -0.05 ? `−${abs} %` : "igual";
};
const TERMS: Record<string, string> = { ingresos_brutos: "ingresos-brutos", sellos: "impuesto-sellos" };

export function RecaudacionPage() {
  const tema = route.useLoaderData();
  const { periodo, anio, frenteANacion } = tema;
  const ib = tema.porImpuesto.find((i) => i.id === "ingresos_brutos")!;
  const now = new Date();
  const monthsBehind = (now.getFullYear() - anio) * 12 + now.getMonth() + 1 - tema.hastaMes;

  return (
    <div className="flex flex-col gap-12">
      <PageHeader action={<ShareButton />} icon={RiReceiptLine} topic="Recaudación" title="¿Cuánto recauda Mendoza con sus impuestos?">
        Lo que cobra la Administración Tributaria Mendoza (ATM) por los impuestos provinciales: Ingresos Brutos, Sellos, Automotor e
        Inmobiliario. Todo está en pesos de {tema.referencia}, para que se pueda comparar entre años.
      </PageHeader>

      {monthsBehind > 3 && (
        <StaleDataAlert title={`El último dato de la ATM es de ${MESES[tema.hastaMes - 1]} de ${anio}`} requestId="recaudacion-atm">
          La ATM publica la recaudación cada mes y esta página se actualiza sola, pero hace {monthsBehind} meses que no hay datos nuevos.
        </StaleDataAlert>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <StatTile
          icon={RiReceiptLine}
          label={`Recaudado en ${anio}`}
          value={billones(tema.total.actual)}
          note={`De ${periodo}. Un billón es un millón de millones`}
        />
        <StatTile
          icon={RiCalendarLine}
          label={`Contra ${periodo} de ${anio - 1}`}
          value={variacion(tema.total.actual, tema.total.anterior)}
          note="Descontada la inflación"
        />
        <StatTile icon={RiUserLine} label="Por habitante" value={pesos(tema.perCapita)} note={`De ${periodo} de ${anio}`} />
      </div>

      <Section id="evolucion" title={`${periodo[0]!.toUpperCase()}${periodo.slice(1)} de cada año`}>
        <div className={cx(tileVariants())}>
          <ColumnChart
            columnas={tema.serie.map((p) => ({ etiqueta: String(p.anio), valor: p.real }))}
            formatValue={millones}
            alto={160}
            ariaLabel={`Recaudación de ${periodo} de cada año, en pesos de ${tema.referencia}`}
          />
        </div>
        <p className="text-body-regular text-text-tertiary text-pretty">
          Los mismos meses de cada año, para que {anio} se pueda comparar aunque no haya terminado. En pesos de {tema.referencia}.
        </p>
      </Section>

      <div className="grid items-start gap-12 lg:grid-cols-2">
        <Section id="por-impuesto" title="¿De qué impuesto sale?">
          <BarList
            items={tema.porImpuesto.map((i) => ({
              nombre: i.nombre,
              etiqueta: TERMS[i.id] ? <Term id={TERMS[i.id]!}>{i.nombre}</Term> : undefined,
              valor: i.actual,
              detalle: `${Math.round((i.actual / tema.total.actual) * 100)} %`,
            }))}
            total={tema.total.actual}
            formatValue={millones}
          />
          <p className="text-body-regular text-text-tertiary text-pretty">
            De {periodo} de {anio}. <Term id="ingresos-brutos">Ingresos Brutos</Term> es {Math.round((ib.actual / tema.total.actual) * 100)}{" "}
            de cada 100 pesos.
          </p>
        </Section>
        {frenteANacion && (
          <Section id="nacion" title="¿Y lo que manda Nación?">
            <BarList
              items={[
                {
                  nombre: "Envíos automáticos de Nación",
                  etiqueta: <Term id="envios-automaticos">Envíos automáticos de Nación</Term>,
                  valor: frenteANacion.nacion,
                },
                { nombre: "Impuestos provinciales (ATM)", valor: frenteANacion.propios, destacado: true },
              ].map((i) => ({ ...i, detalle: `${Math.round((i.valor / (frenteANacion.nacion + frenteANacion.propios)) * 100)} %` }))}
              total={frenteANacion.nacion + frenteANacion.propios}
              formatValue={millones}
            />
            <p className="text-body-regular text-text-tertiary text-pretty">
              De {periodo} de {anio}, por cada $ 100 que cobró la provincia, Nación le mandó ${" "}
              {formatNumber(Math.round((frenteANacion.nacion / frenteANacion.propios) * 100))}. Una parte de los dos se reparte entre los
              municipios: ver{" "}
              <Link to="/coparticipacion" className="text-text-link underline">
                Coparticipación
              </Link>
              .
            </p>
          </Section>
        )}
      </div>

      <Section id="este-anio" title={`¿Cómo viene ${anio}?`}>
        <ul className={listVariants()}>
          {tema.porImpuesto.map((i) => (
            <li key={i.id} className={cx(listRowVariants({ interactive: false }), "text-body-regular")}>
              <span className="min-w-0 flex-1 truncate">{i.nombre}</span>
              <span className="hidden shrink-0 text-right whitespace-nowrap text-text-secondary tabular-nums sm:inline">
                {millones(i.actual)}
              </span>
              <span className="w-16 shrink-0 text-right font-medium whitespace-nowrap tabular-nums">{variacion(i.actual, i.anterior)}</span>
            </li>
          ))}
        </ul>
        <p className="text-body-regular text-text-tertiary text-pretty">
          De {periodo} de {anio} contra los mismos meses de {anio - 1}, en pesos de {tema.referencia}: la variación ya descuenta la
          inflación.
        </p>
      </Section>

      <Alert variant="note" title="Qué no está acá">
        Las regalías del petróleo y la minería no las cobra la ATM y no están en esta página. Tampoco la coparticipación ni otros envíos de
        Nación, salvo en la comparación de arriba.
      </Alert>

      <p className="text-body-regular text-text-tertiary text-pretty">
        Cómo lo calculamos: recaudación mensual publicada por la ATM, sumada por año y llevada a pesos de {tema.referencia} con el IPC
        nacional de INDEC (promedio de cada año). Datos completos, mes a mes y desde 2000, en{" "}
        <Link to="/datos/$fuente" params={{ fuente: "atm-recaudacion" }} className="underline hover:text-text-primary">
          Datos › Recaudación
        </Link>
        .
      </p>

      <FuentesOficiales ids={["atm-recaudacion", "dnap-ron", "indices"]} />
    </div>
  );
}
