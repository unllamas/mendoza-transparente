/** Formato de celdas según el diccionario de datos. */

import { formatDate, humanize, mesCorto } from "./lib.ts";
import type { ColumnaDict, Diccionario } from "./types.ts";

const entero = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const unDecimal = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

/** Montos: completos hasta un millón y desde ahí en millones ("$ 54,1 millones", "$ 1.673 millones"). */
export function formatMoneda(valor: number, moneda: string): string {
  const signo = moneda === "USD" ? "US$" : "$";
  const abs = Math.abs(valor);
  const menos = valor < 0 ? "−" : "";
  if (abs >= 1e6) return `${menos}${signo} ${(abs >= 1e8 ? entero : unDecimal).format(abs / 1e6)} millones`;
  return `${menos}${signo} ${entero.format(abs)}`;
}

export interface ColumnaVista {
  key: string;
  index: number;
  etiqueta: string;
  descripcion?: string;
  numerica: boolean;
  /** La celda es un enlace: el valor crudo es la URL y `formato` devuelve el texto a mostrar. */
  url: boolean;
  formato: (valor: string, fila: string[]) => string;
}

/** Columnas visibles, en orden, con su etiqueta y su formateador. */
export function columnasVisibles(columns: string[], dict: Diccionario | null): ColumnaVista[] {
  const defs = dict?.columnas ?? {};
  const orden = dict?.orden ?? [];
  const ordenadas = [...orden.filter((c) => columns.includes(c)), ...columns.filter((c) => !orden.includes(c))];

  return ordenadas
    .filter((key) => !defs[key]?.oculta)
    .map((key) => {
      const def: ColumnaDict = defs[key] ?? {};
      const tipo = def.tipo ?? "texto";
      const monedaIdx = def.monedaColumna ? columns.indexOf(def.monedaColumna) : -1;
      return {
        key,
        index: columns.indexOf(key),
        etiqueta: def.etiqueta ?? key,
        descripcion: def.descripcion,
        numerica: ["numero", "moneda", "porcentaje"].includes(tipo),
        url: tipo === "url",
        formato: (valor: string, fila: string[]) => {
          if (valor === "") return "—";
          const n = Number(valor) * (def.escala ?? 1);
          switch (tipo) {
            case "moneda":
              return Number.isFinite(n) ? formatMoneda(n, monedaIdx >= 0 ? fila[monedaIdx]! : (def.moneda ?? "ARS")) : valor;
            case "numero":
              return Number.isFinite(n) ? `${decimal.format(n)}${def.unidad ? ` ${def.unidad}` : ""}` : valor;
            case "porcentaje":
              return Number.isFinite(n) ? `${unDecimal.format(n)} %` : valor;
            case "fecha":
              return /^\d{4}-\d{2}-\d{2}/.test(valor) ? formatDate(valor) : valor;
            case "mes":
              return Number.isFinite(Number(valor)) ? mesCorto(Number(valor)) : valor;
            case "url":
              return "Abrir ↗";
            case "booleano":
              return ["1", "true", "si", "sí"].includes(valor.toLowerCase()) ? "Sí" : "No";
            default: {
              if (def.valores?.[valor]) return def.valores[valor];
              if (def.quitarPrefijo && valor.startsWith(def.quitarPrefijo)) return valor.slice(def.quitarPrefijo.length);
              // Códigos tipo "petroleo_crudo" → "Petroleo crudo".
              if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(valor)) return humanize(valor);
              return valor;
            }
          }
        },
      };
    });
}
