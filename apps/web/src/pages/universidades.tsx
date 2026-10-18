import { Alert } from "@mt/ui/components/alert";
import { listRowVariants, listVariants, tileVariants } from "@mt/ui/components/card";
import { PageHeader, Section } from "@mt/ui/components/section";
import { StatTile } from "@mt/ui/components/stat-tile";
import { cx } from "@mt/ui/lib/cx";
import { RiArrowRightSLine, RiBankLine, RiFileList3Line, RiPercentLine, RiSchoolLine } from "@remixicon/react";
import { getRouteApi, Link } from "@tanstack/react-router";
import { formatMoneda } from "@/celdas.ts";
import { BarList } from "@/charts/bar-list.tsx";
import { ChangeChart } from "@/charts/change-chart.tsx";
import { ColumnChart } from "@/charts/column-chart.tsx";
import { WithBreadcrumbs } from "@/components/breadcrumbs.tsx";
import { Term } from "@/components/glossary-term.tsx";
import { FuentesOficiales } from "@/components/official-sources.tsx";
import { ShareButton } from "@/components/share-button.tsx";
import { StaleDataAlert } from "@/components/stale-data-alert.tsx";
import { formatDate, formatNumber } from "@/lib.ts";
import type { UniversidadesTema } from "@/types.ts";

const hubRoute = getRouteApi("/universidades");

const millones = (v: number) => formatMoneda(v, "ARS");

export function UniversidadesPage() {
  const tema = hubRoute.useLoaderData();
  const { enCurso, utn } = tema;

  return (
    <div className="flex flex-col gap-12">
      <PageHeader action={<ShareButton />} icon={RiSchoolLine} topic="Universidades" title="Universidades nacionales en Mendoza">
        Las universidades nacionales las paga Nación, no la provincia. En Mendoza hay dos: la Universidad Nacional de Cuyo y las facultades
        regionales de la Universidad Tecnológica Nacional. Los montos están en pesos de {tema.referencia}.
      </PageHeader>

      <Section id="universidades" title="Cuál querés mirar">
        <ul className={listVariants()}>
          <li>
            <Link
              to="/universidades/uncuyo"
              data-track="university.open"
              data-track-university="uncuyo"
              className={cx(listRowVariants(), "min-h-16")}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-headline-regular text-text-link">Universidad Nacional de Cuyo</span>
                <span className="truncate text-body-regular text-text-secondary">
                  {millones(enCurso.presupuestado)} en {enCurso.anio}
                </span>
              </span>
              <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
            </Link>
          </li>
          <li className={cx(listRowVariants({ interactive: false }), "min-h-16")}>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-headline-regular">Universidad Tecnológica Nacional</span>
              <span className="truncate text-body-regular text-text-secondary">Sin datos propios de Mendoza</span>
            </span>
          </li>
        </ul>
      </Section>

      {utn && (
        <Alert title="La UTN no se puede separar por provincia">
          La UTN informa una sola cifra para todo el país: para {utn.anio} tiene presupuestados {millones(utn.presupuestado)} y en{" "}
          {utn.anioEstudiantes} tuvo {formatNumber(utn.estudiantes)} estudiantes, pero no se sabe cuánto de eso corresponde a sus facultades
          de Mendoza y San Rafael.{" "}
          <Link to="/no-publicado" search={{ dato: "utn-por-regional" } as never} className="text-text-link underline">
            Cómo pedir los datos de la UTN en Mendoza
          </Link>
        </Alert>
      )}

      <FuentesOficiales ids={["universidades-presupuesto", "universidades-estadisticas"]} />
    </div>
  );
}

const uncuyoRoute = getRouteApi("/universidades/uncuyo");

const pesos = (v: number) => `$ ${formatNumber(Math.round(v))}`;
const count = (n: number, singular: string, plural: string) => `${formatNumber(n)} ${n === 1 ? singular : plural}`;
type Discipline = NonNullable<UniversidadesTema["disciplinas"]>["items"][number];
const totalDe = (items: Discipline[], key: "estudiantes" | "egresados") => items.reduce((s, d) => s + d[key], 0);
const topBy = (items: Discipline[], key: "estudiantes" | "egresados") => [...items].sort((a, b) => b[key] - a[key]).slice(0, 10);
const share = (v: number, total: number) => `${Math.max(1, Math.round((v / total) * 100))} %`;
const pct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v))} %`;

export function UncuyoPage() {
  const tema = uncuyoRoute.useLoaderData();
  const { enCurso, transferencias: tr } = tema;
  const destinoTotal = enCurso.destino.reduce((s, d) => s + d.real, 0);
  const sueldos = enCurso.destino.filter((d) => d.nombre.startsWith("Sueldos")).reduce((s, d) => s + d.real, 0);
  const vsAnterior = (enCurso.presupuestado / enCurso.anterior.real - 1) * 100;
  const cambios = tr.slice(1).map((t, i) => ({ etiqueta: String(t.anio), valor: (t.real / tr[i]!.real - 1) * 100 }));
  // The biggest yearly drop, to explain it with the nominal amounts.
  const caida = cambios.reduce((min, c) => (c.valor < min.valor ? c : min), cambios[0]!);
  const caidaAnio = Number(caida.etiqueta);
  const desde = tr.find((t) => t.anio === caidaAnio - 1)!;
  const ultimo = tr.at(-1)!;
  const alumnos = tema.estudiantes.at(-1)!;
  const p = tema.personal;

  return (
    <div className="flex flex-col gap-12">
      <WithBreadcrumbs items={[{ label: "Universidades", to: "/universidades" }]} current={{ label: "UNCuyo", icon: RiSchoolLine }}>
        <PageHeader action={<ShareButton />} title="¿Cuánto recibe la UNCuyo y a cuántos forma?">
          La Universidad Nacional de Cuyo la paga Nación: casi toda su plata sale del Tesoro nacional. Acá está cuánto tiene para{" "}
          {enCurso.anio}, en qué se usa y cuántos estudiantes tiene. Los montos están en pesos de {tema.referencia}.
        </PageHeader>
      </WithBreadcrumbs>

      <div className="grid gap-3 md:grid-cols-3">
        <StatTile
          icon={RiFileList3Line}
          label={`Presupuesto ${enCurso.anio}`}
          value={millones(enCurso.presupuestado)}
          note="Lo que Nación tiene previsto transferirle"
        />
        <StatTile
          icon={RiBankLine}
          label={`Ya transferido al ${formatDate(enCurso.corte)}`}
          value={millones(enCurso.devengado)}
          note={`${Math.round((enCurso.devengado / enCurso.presupuestado) * 100)} % del presupuesto del año`}
        />
        <StatTile
          icon={RiPercentLine}
          label={`Contra lo recibido en ${enCurso.anterior.anio}`}
          value={pct(vsAnterior)}
          note="Descontada la inflación. Puede ampliarse en el año"
        />
      </div>

      <Section id="destino" title={`¿En qué se usa en ${enCurso.anio}?`}>
        <div className="max-w-2xl">
          <BarList
            items={enCurso.destino.map((d) => ({
              nombre: d.nombre,
              valor: d.real,
              detalle: `${Math.max(1, Math.round((d.real / destinoTotal) * 100))} %`,
            }))}
            total={destinoTotal}
            formatValue={millones}
          />
        </div>
        <p className="text-body-regular text-text-tertiary text-pretty">
          Lo <Term id="devengado">devengado</Term> hasta el {formatDate(enCurso.corte)}: {Math.round((sueldos / destinoTotal) * 100)} de
          cada 100 pesos son sueldos. Nación no publica en qué gasta cada facultad.
        </p>
      </Section>

      <Section id="transferencias" title="Lo que recibió cada año">
        <div className="grid items-start gap-8 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <h3 className="text-headline-semibold">En pesos de hoy</h3>
            <div className={cx(tileVariants())}>
              <ColumnChart
                columnas={tr.map((t) => ({ etiqueta: String(t.anio), valor: t.real, detalle: `${millones(t.nominal)} de ese año` }))}
                formatValue={millones}
                ariaLabel={`Transferencias del Tesoro nacional a la UNCuyo por año, en pesos de ${tema.referencia}`}
              />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="text-headline-semibold">Suba o baja contra el año anterior</h3>
            <div className={cx(tileVariants())}>
              <ChangeChart
                columnas={cambios}
                formatValue={pct}
                formatTick={(y) => `'${y.slice(2)}`}
                ariaLabel="Variación anual de las transferencias a la UNCuyo, descontada la inflación"
              />
            </div>
          </div>
        </div>
        <div className={cx(tileVariants(), "flex max-w-3xl flex-col gap-2")}>
          <h3 className="text-headline-semibold">¿Por qué baja si cada año llegan más pesos?</h3>
          <p className="text-body-regular text-text-secondary text-pretty">
            Entre {desde.anio} y {ultimo.anio} lo que mandó Nación pasó de {millones(desde.nominal)} a {millones(ultimo.nominal)}: más
            pesos, pero los precios subieron más. Descontada la inflación, en {ultimo.anio} recibió{" "}
            {Math.abs(Math.round((ultimo.real / desde.real - 1) * 100))} % menos que en {desde.anio}. Como 9 de cada 10 pesos son sueldos,
            eso quiere decir que la plata para sueldos subió menos que la inflación.
          </p>
          <p className="text-body-regular text-text-secondary text-pretty">
            En 2024 y 2025 no hubo ley de presupuesto nacional: rigió el de 2023, <Term id="presupuesto-prorrogado">prorrogado</Term> y
            ajustado por decreto.
          </p>
        </div>
      </Section>

      <StaleDataAlert title={`Los estudiantes y el personal son de ${alumnos.anio}`} requestId="uncuyo-estudiantes-al-dia">
        Salen del Anuario de Estadísticas Universitarias de la Nación, que se publica con casi dos años de atraso, y la UNCuyo no publica
        los suyos en un archivo para descargar.
      </StaleDataAlert>

      <Section id="estudiantes" title="Estudiantes y egresados">
        <div className="grid gap-3 md:grid-cols-3">
          <StatTile
            label={`Estudiantes en ${alumnos.anio}`}
            value={formatNumber(alumnos.estudiantes)}
            note={`Y ${formatNumber(alumnos.posgrado ?? 0)} de posgrado`}
          />
          <StatTile label={`Ingresantes en ${alumnos.anio}`} value={formatNumber(alumnos.nuevos)} note="Se inscribieron por primera vez" />
          <StatTile label={`Egresados en ${alumnos.anio}`} value={formatNumber(alumnos.egresados)} note="Terminaron su carrera" />
        </div>
        <div className="grid items-start gap-8 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <h3 className="text-headline-semibold">Estudiantes por año</h3>
            <div className={cx(tileVariants())}>
              <ColumnChart
                columnas={tema.estudiantes.map((e) => ({ etiqueta: String(e.anio), valor: e.estudiantes }))}
                formatValue={(v) => count(v, "estudiante", "estudiantes")}
                ariaLabel="Estudiantes de pregrado y grado de la UNCuyo por año"
              />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="text-headline-semibold">Egresados por año</h3>
            <div className={cx(tileVariants())}>
              <ColumnChart
                columnas={tema.estudiantes.map((e) => ({ etiqueta: String(e.anio), valor: e.egresados }))}
                formatValue={(v) => count(v, "egresado", "egresados")}
                ariaLabel="Egresados de pregrado y grado de la UNCuyo por año"
              />
            </div>
          </div>
        </div>
        <p className="text-body-regular text-text-tertiary text-pretty">
          Estudiantes de <Term id="pregrado-grado-posgrado">pregrado y grado</Term>. Lo que manda Nación dividido por los estudiantes de
          grado y posgrado da {pesos(tema.porEstudiante.at(-1)?.real ?? 0)} por estudiante en {tema.porEstudiante.at(-1)?.anio}, en pesos de{" "}
          {tema.referencia}; es un promedio, porque esa plata también paga los colegios secundarios de la UNCuyo y la investigación.
        </p>
      </Section>

      {tema.disciplinas && (
        <Section id="carreras" title={`¿Qué estudian? (${tema.disciplinas.anio})`}>
          <div className="grid items-start gap-8 lg:grid-cols-2">
            <div className="flex flex-col gap-3">
              <h3 className="text-headline-semibold">Estudiantes por disciplina</h3>
              <BarList
                items={topBy(tema.disciplinas.items, "estudiantes").map((d) => ({
                  nombre: d.disciplina,
                  valor: d.estudiantes,
                  detalle: share(d.estudiantes, totalDe(tema.disciplinas!.items, "estudiantes")),
                }))}
                total={totalDe(tema.disciplinas.items, "estudiantes")}
                formatValue={formatNumber}
              />
            </div>
            <div className="flex flex-col gap-3">
              <h3 className="text-headline-semibold">Egresados por disciplina</h3>
              <BarList
                items={topBy(tema.disciplinas.items, "egresados").map((d) => ({
                  nombre: d.disciplina,
                  valor: d.egresados,
                  detalle: share(d.egresados, totalDe(tema.disciplinas!.items, "egresados")),
                }))}
                total={totalDe(tema.disciplinas.items, "egresados")}
                formatValue={formatNumber}
              />
            </div>
          </div>
          <p className="text-body-regular text-text-tertiary text-pretty">
            Las 10 disciplinas con más estudiantes y con más egresados, de {tema.disciplinas.items.length}. Cada barra es su parte del total
            de la UNCuyo: la barra llena sería el 100 %. El Anuario agrupa las carreras parecidas en disciplinas y no publica cada carrera
            por separado, ni cuántos de los que entran se reciben ni en cuánto tiempo.{" "}
            <Link
              to="/no-publicado"
              search={{ dato: "uncuyo-carreras" } as never}
              data-track="missing_data.stale.open"
              data-track-item="uncuyo-carreras"
              className="text-text-link underline"
            >
              Cómo pedir los datos por carrera
            </Link>
          </p>
        </Section>
      )}

      {tema.rendimiento && (
        <Section id="materias" title={`¿Cuántas materias aprueban? (${tema.rendimiento.anio})`}>
          <div className="grid gap-3 md:grid-cols-3">
            <StatTile
              label="Ingresantes sin materias"
              value={`${Math.round(tema.rendimiento.nuevosSinMaterias)} %`}
              note="No aprobaron ninguna en su primer año"
            />
            <StatTile
              label="Avanzados con 2 o más"
              value={`${Math.round(tema.rendimiento.reinscriptosDosOMas)} %`}
              note="De los que ya cursaban, aprobaron 2 materias o más"
            />
            <StatTile
              label="Avanzados sin materias"
              value={`${Math.round(tema.rendimiento.reinscriptosSinMaterias)} %`}
              note="De los que ya cursaban, no aprobaron ninguna en el año"
            />
          </div>
          <p className="text-body-regular text-text-tertiary text-pretty">
            Materias aprobadas en el año según el Anuario. Aprobar pocas materias no quiere decir que se haya abandonado: puede ser que la
            persona trabaje o curse menos materias por año.
          </p>
        </Section>
      )}

      {p && (
        <Section id="personal" title={`Quiénes trabajan (${p.anio})`}>
          <ul className={listVariants()}>
            {[
              {
                label: "Cargos docentes",
                value: p.docentes.cargos,
                note: `ocupados por ${count(p.docentes.personas, "persona", "personas")}`,
              },
              { label: "Cargos no docentes", value: p.noDocentes.cargos, note: "administración, mantenimiento y servicios" },
              {
                label: "Cargos en los colegios",
                value: p.preuniversitario.cargos,
                note: `secundarios de la UNCuyo, ${count(p.preuniversitario.personas, "persona", "personas")}`,
              },
              { label: "Autoridades superiores", value: p.autoridades, note: "personas en cargos de conducción" },
            ].map((r) => (
              <li key={r.label} className={cx(listRowVariants({ interactive: false }), "text-body-regular")}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{r.label}</span>
                  <span className="truncate text-caption-1-regular text-text-tertiary">{r.note}</span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">{formatNumber(r.value)}</span>
              </li>
            ))}
          </ul>
          <div className="flex max-w-2xl flex-col gap-3">
            <h3 className="text-headline-semibold">
              Cargos docentes por <Term id="dedicacion-docente">dedicación</Term>
            </h3>
            <BarList
              items={p.dedicacion.map((d) => ({
                nombre: d.nombre,
                etiqueta: <Term id="dedicacion-docente">{d.nombre}</Term>,
                valor: d.cargos,
                detalle: `${Math.round((d.cargos / p.docentes.cargos) * 100)} %`,
              }))}
              total={p.docentes.cargos}
              formatValue={(v) => count(v, "cargo", "cargos")}
            />
            <p className="text-body-regular text-text-tertiary text-pretty">
              Contamos <Term id="cargos">cargos, no personas</Term>: una persona puede tener más de uno.
            </p>
          </div>
        </Section>
      )}

      <p className="text-body-regular text-text-tertiary text-pretty">
        Cómo lo calculamos: transferencias del Tesoro nacional de Presupuesto Abierto y cifras del Anuario de Estadísticas Universitarias,
        llevadas a pesos de {tema.referencia} con el IPC nacional de INDEC (promedio de cada año). Datos completos, desde 1996, en{" "}
        <Link to="/datos/$fuente" params={{ fuente: "universidades-presupuesto" }} className="underline hover:text-text-primary">
          Datos › Transferencias
        </Link>{" "}
        y{" "}
        <Link to="/datos/$fuente" params={{ fuente: "universidades-estadisticas" }} className="underline hover:text-text-primary">
          Datos › Anuario universitario
        </Link>
        .
      </p>

      <FuentesOficiales ids={["universidades-presupuesto", "universidades-estadisticas", "indices"]} />
    </div>
  );
}
