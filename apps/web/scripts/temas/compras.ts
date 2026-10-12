/**
 * Detalle de compras para el panel lateral: un archivo por proveedor (por CUIT) y los procesos
 * repartidos en archivos chicos, con sus adjudicaciones.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { procesoShard, PROCESO_SHARDS } from "../../src/shard.ts";
import type { ProcesoDetalle, ProveedorDetalle } from "../../src/types.ts";
import { deflactor } from "./inflacion.ts";

type CsvRow = Record<string, string>;

export function buildCompras(
  procesos: CsvRow[],
  adjudicaciones: CsvRow[],
  outDir: string,
  empresas: CsvRow[] = [],
  ipc: CsvRow[] = [],
) {
  const inflacion = deflactor(ipc);
  const porCuitEmpresa = new Map(empresas.map((e) => [e.cuit!, e]));
  const porOcid = new Map(procesos.map((p) => [p.ocid!, p]));
  const activas = adjudicaciones.filter((a) => a.estado_adjudicacion !== "cancelled" && a.proveedor_cuit);

  // Procesos con sus adjudicaciones.
  const shards: Record<string, ProcesoDetalle>[] = Array.from({ length: PROCESO_SHARDS }, () => ({}));
  for (const p of procesos) {
    shards[procesoShard(p.ocid!)]![p.ocid!] = {
      ocid: p.ocid!,
      fecha: p.fecha!,
      comprador: p.comprador!,
      titulo: p.titulo!,
      metodo: p.metodo_contratacion!,
      estado: p.estado!,
      montoEstimado: Number(p.monto_estimado) || null,
      oferentes: p.cantidad_oferentes === "" ? null : Number(p.cantidad_oferentes),
      adjudicaciones: [],
    };
  }
  for (const a of activas) {
    const proceso = shards[procesoShard(a.ocid!)]![a.ocid!];
    proceso?.adjudicaciones.push({ proveedor: a.proveedor_nombre!, cuit: a.proveedor_cuit!, monto: Number(a.monto) });
  }
  mkdirSync(join(outDir, "procesos"), { recursive: true });
  shards.forEach((s, i) => writeFileSync(join(outDir, "procesos", `${i}.json`), JSON.stringify(s)));

  // Perfil de cada proveedor.
  const porCuit = new Map<string, CsvRow[]>();
  for (const a of activas) porCuit.set(a.proveedor_cuit!, [...(porCuit.get(a.proveedor_cuit!) ?? []), a]);

  mkdirSync(join(outDir, "proveedores"), { recursive: true });
  for (const [cuit, filas] of porCuit) {
    const organismos = new Map<string, { monto: number; procesos: Set<string> }>();
    const porAnio = new Map<string, number>();
    for (const a of filas) {
      const comprador = porOcid.get(a.ocid!)?.comprador ?? "Sin dato";
      const o = organismos.get(comprador) ?? { monto: 0, procesos: new Set<string>() };
      o.monto += Number(a.monto);
      o.procesos.add(a.ocid!);
      organismos.set(comprador, o);
      // Algunas adjudicaciones vienen sin fecha en el origen: cuentan en el total, no en el desglose por año.
      const anio = (a.fecha_adjudicacion || porOcid.get(a.ocid!)?.fecha || "").slice(0, 4);
      if (anio) porAnio.set(anio, (porAnio.get(anio) ?? 0) + Number(a.monto));
    }
    const fechas = filas.map((a) => a.fecha_adjudicacion!).filter(Boolean).sort();
    const e = porCuitEmpresa.get(cuit);
    const meses =
      e?.fecha_constitucion && fechas[0]
        ? Math.floor((Date.parse(fechas[0]) - Date.parse(e.fecha_constitucion)) / (30.44 * 24 * 3600 * 1000))
        : null;
    const detalle: ProveedorDetalle = {
      empresa: e
        ? {
            tipoPersona: e.tipo_persona === "humana" ? "humana" : "juridica",
            razonSocial: e.razon_social || null,
            tipoSocietario: e.tipo_societario || null,
            fechaConstitucion: e.fecha_constitucion || null,
            localidad: [e.localidad, e.provincia].filter(Boolean).join(", ") || null,
            actividad: e.actividad || null,
            mesesHastaPrimeraAdjudicacion: meses !== null && meses >= 0 ? meses : null,
          }
        : null,
      cuit,
      nombre: filas.at(-1)!.proveedor_nombre!,
      total: filas.reduce((s, a) => s + Number(a.monto), 0),
      adjudicaciones: filas.length,
      procesos: new Set(filas.map((a) => a.ocid)).size,
      primera: fechas[0] ?? "",
      ultima: fechas.at(-1) ?? "",
      organismos: [...organismos]
        .map(([nombre, o]) => ({ nombre, monto: o.monto, procesos: o.procesos.size }))
        .sort((a, b) => b.monto - a.monto)
        .slice(0, 8),
      // Todos los años entre el primero y el último, también los que no tuvo adjudicaciones.
      porAnio: (() => {
        const anios = [...porAnio.keys()].map(Number);
        if (!anios.length) return [];
        const serie = [];
        for (let anio = Math.min(...anios); anio <= Math.max(...anios); anio++) {
          const monto = porAnio.get(String(anio)) ?? 0;
          serie.push({ anio, monto, real: inflacion ? inflacion.aReal(monto, anio) : monto });
        }
        return serie;
      })(),
      referenciaReal: inflacion?.referencia ?? null,
      recientes: filas
        .sort((a, b) => b.fecha_adjudicacion!.localeCompare(a.fecha_adjudicacion!))
        .slice(0, 25)
        .map((a) => {
          const p = porOcid.get(a.ocid!);
          return {
            ocid: a.ocid!,
            fecha: a.fecha_adjudicacion || p?.fecha || "",
            titulo: p?.titulo ?? "",
            comprador: p?.comprador ?? "",
            metodo: p?.metodo_contratacion ?? "",
            monto: Number(a.monto),
          };
        }),
    };
    writeFileSync(join(outDir, "proveedores", `${cuit}.json`), JSON.stringify(detalle));
  }
  return porCuit.size;
}
