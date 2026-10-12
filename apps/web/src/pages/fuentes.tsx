import { getRouteApi } from "@tanstack/react-router";

import { formatBytes, formatDate } from "../lib.ts";
import { EstadoBadge } from "./components.tsx";

const route = getRouteApi("/fuentes");

export function FuentesPage() {
  const { sources } = route.useLoaderData();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Fuentes</h1>
        <p className="text-ink-2">
          De dónde sale cada dato. Descargamos los archivos oficiales periódicamente y guardamos cada versión con su
          fecha, para que nada se pierda aunque el organismo lo borre.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-ink-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Fuente</th>
              <th className="px-4 py-3 font-medium">Frecuencia</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Última descarga</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sources.map((s) => (
              <tr key={s.id} className="align-top">
                <td className="flex flex-col gap-0.5 px-4 py-3">
                  {s.url ? (
                    <a href={s.url} className="font-medium hover:underline">
                      {s.nombre}
                    </a>
                  ) : (
                    <span className="font-medium">{s.nombre}</span>
                  )}
                  {s.organismo && <span className="text-ink-muted">{s.organismo}</span>}
                </td>
                <td className="px-4 py-3 text-ink-2">{s.frecuencia}</td>
                <td className="px-4 py-3">
                  <EstadoBadge estado={s.estado} />
                </td>
                <td className="px-4 py-3 text-ink-2 tabular-nums">
                  {s.raw.lastFetch ? (
                    <>
                      {formatDate(s.raw.lastFetch)}
                      <span className="block text-ink-muted">
                        {s.raw.files} {s.raw.files === 1 ? "archivo" : "archivos"} · {formatBytes(s.raw.bytes)}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
