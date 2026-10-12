import { getRouteApi, Link } from "@tanstack/react-router";
import { Coins, MapPin, UserRound } from "lucide-react";
import { useState } from "react";

import { formatMoneda } from "../celdas.ts";
import { LineChart } from "../charts/line-chart.tsx";
import { MapaMendoza } from "../charts/mapa.tsx";
import { GOBIERNOS } from "../gobiernos.ts";
import { formatNumber } from "../lib.ts";
import type { CoparticipacionTema } from "../types.ts";
import { PageHeader, Section, StatTile } from "./components.tsx";

const route = getRouteApi("/coparticipacion");

const pesos = (v: number) => `$ ${formatNumber(Math.round(v))}`;
const FUENTE = "https://sitios.mendoza.gob.ar/haciendayfinanzas/participacion-municipal/";

export function CoparticipacionPage() {
  const { tema, mapa } = route.useLoaderData();
  const [sel, setSel] = useState<string | null>(null);
  const ranking = [...tema.municipios].sort((a, b) => b.perCapita - a.perCapita);
  const provincial = tema.provincia.find((p) => p.anio === tema.anioCompleto)!;
  const municipio = ranking.find((m) => m.municipio === sel);

  return (
    <div className="flex flex-col gap-12">
      <PageHeader icon={Coins} tema="Coparticipación" titulo="¿Cuánta plata reciben los municipios?">
        La provincia reparte entre los 18 municipios una parte de lo que recauda y de lo que le manda Nación
          (coparticipación). Todo está en pesos de {tema.referencia}, para que se pueda comparar entre años.
      </PageHeader>

      <div className="grid gap-3 md:grid-cols-3">
        <StatTile
          icon={Coins}
          label={`Repartido en ${tema.anioCompleto}`}
          value={formatMoneda(tema.totalReal, "ARS")}
          note={`En pesos de ${tema.referencia}`}
        />
        <StatTile
          icon={UserRound}
          label="Promedio por habitante"
          value={provincial.perCapita ? pesos(provincial.perCapita) : "—"}
          note={`Toda la provincia, ${tema.anioCompleto}`}
        />
        <StatTile
          icon={MapPin}
          label="Recibe más por habitante"
          value={ranking[0]!.municipio}
          note={`${pesos(ranking[0]!.perCapita)} por habitante`}
        />
      </div>

      <Section title={`Por habitante, ${tema.anioCompleto}`}>
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <MapaMendoza
            mapa={mapa}
            valores={Object.fromEntries(tema.municipios.map((m) => [m.municipio, m.perCapita]))}
            formatValue={pesos}
            seleccionado={sel}
            onSelect={setSel}
            leyenda={`Pesos por habitante en ${tema.anioCompleto} (de ${tema.referencia})`}
          />
          {municipio ? (
            <DetalleMunicipio tema={tema} municipio={municipio} puesto={ranking.indexOf(municipio) + 1} onClose={() => setSel(null)} />
          ) : (
            <ol className="flex flex-col">
              {ranking.map((m, i) => (
                <li key={m.municipio}>
                  <button
                    type="button"
                    onClick={() => setSel(m.municipio)}
                    className="grid w-full grid-cols-[1.5rem_1fr_auto] items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-tile"
                  >
                    <span className="text-ink-muted tabular-nums">{i + 1}</span>
                    <span>{m.municipio}</span>
                    <span className="tabular-nums text-ink-2">{pesos(m.perCapita)}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
        <p className="text-sm text-ink-muted text-pretty">
          Los municipios con poca población reciben más por habitante porque una parte del reparto es fija o se
          distribuye en partes iguales, sin importar cuánta gente vive en cada uno.
        </p>
      </Section>

      <Section title={`Total repartido por año, en millones de pesos de ${tema.referencia}`}>
        <div className="rounded-xl bg-tile p-4">
          <LineChart
            data={tema.provincia.filter((p) => !p.parcial).map((p) => ({ fecha: `${p.anio}-01-01`, valor: p.real / 1e6 }))}
            bands={GOBIERNOS.map((g) => ({ desde: g.desde, hasta: g.hasta, label: g.nombre }))}
            formatValue={(v) => `$ ${formatNumber(Math.round(v))} M`}
            formatAxis={(v) => formatNumber(v)}
            formatDate={(f) => f.slice(0, 4)}
            ariaLabel="Coparticipación total a municipios por año, en pesos de hoy"
          />
        </div>
      </Section>

      <p className="text-sm text-ink-muted text-pretty">
        Cómo lo calculamos: montos anuales de{" "}
        <a href={FUENTE} className="underline hover:text-ink">
          participación municipal (Ministerio de Hacienda)
        </a>
        , llevados a pesos de {tema.referencia} con el IPC nacional de INDEC (promedio de cada año) y divididos por la
        proyección de población de INDEC. Entre 2007 y 2015 el IPC oficial subestimó la inflación, así que los montos de
        esos años quedan algo inflados. Datos completos en{" "}
        <Link to="/datos/$fuente" params={{ fuente: "hacienda-participacion-municipal" }} className="underline hover:text-ink">
          Datos › Coparticipación
        </Link>
        .
      </p>
    </div>
  );
}

function DetalleMunicipio({
  tema,
  municipio: m,
  puesto,
  onClose,
}: {
  tema: CoparticipacionTema;
  municipio: CoparticipacionTema["municipios"][number];
  puesto: number;
  onClose: () => void;
}) {
  const serie = m.serie.filter((p) => p.perCapita !== null && !p.parcial);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xl font-semibold tracking-tight">{m.municipio}</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-line px-3 py-1 text-sm text-ink-2 hover:border-axis hover:text-ink"
        >
          Ver ranking
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Por habitante" value={pesos(m.perCapita)} note={`Puesto ${puesto} de 18`} />
        <StatTile label="Total del año" value={formatMoneda(m.real, "ARS")} note={String(tema.anioCompleto)} />
      </div>
      <p className="text-sm text-ink-2">{formatNumber(m.poblacion)} habitantes (proyección INDEC).</p>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Por habitante, en pesos de {tema.referencia}</span>
        <div className="rounded-xl bg-tile p-3">
          <LineChart
            data={serie.map((p) => ({ fecha: `${p.anio}-01-01`, valor: p.perCapita! }))}
            formatValue={pesos}
            formatAxis={(v) => (v >= 1e6 ? `${formatNumber(v / 1e6)} M` : `${formatNumber(v / 1e3)} mil`)}
            formatDate={(f) => f.slice(0, 4)}
            height={200}
            ariaLabel={`Coparticipación por habitante de ${m.municipio}`}
          />
        </div>
      </div>
    </div>
  );
}
