import { getRouteApi } from "@tanstack/react-router";
import { Check, ChevronRight, Copy, ExternalLink, EyeOff, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { NO_PUBLICADO_CATEGORIES, type NoPublicadoCategory } from "../no-publicado-categories.ts";
import type { NoPublicado } from "../types.ts";
import { Aviso, PageHeader, Segmented, Sheet } from "./components.tsx";

const route = getRouteApi("/no-publicado");

const FORMULARIO =
  "https://ticketsform.mendoza.gov.ar/ticketsform/servlet/responderformulario?AIP_SOLICITUDINFORMACIONPUBLICA";
const LEY_9070 = "https://media.mendoza.gob.ar/principal/uploads/2025/08/Ley-de-Acceso-a-la-Informacion-Publica-9070-1.pdf";

// Estado con punto de color y texto: el color nunca va solo.
const ESTADOS: Record<NoPublicado["estado"], { label: string; dot: string }> = {
  sin_publicar: { label: "Sin publicar", dot: "bg-critical" },
  parcial: { label: "Publicado en parte", dot: "bg-warning" },
  desactualizado: { label: "Desactualizado", dot: "bg-warning" },
};

export function NoPublicadoPage() {
  const items = route.useLoaderData();
  const [abierto, setAbierto] = useState<NoPublicado | null>(null);
  const [category, setCategory] = useState<NoPublicadoCategory | "todas">("todas");

  // Direct links (/no-publicado#nomina-sueldos) open that request.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    const item = items.find((i) => i.id === id);
    if (item) setAbierto(item);
  }, [items]);

  const present = (Object.keys(NO_PUBLICADO_CATEGORIES) as NoPublicadoCategory[]).filter((c) => items.some((i) => i.categoria === c));
  const groups = category === "todas" ? present : [category];
  const counts = { sin_publicar: 0, parcial: 0, desactualizado: 0 };
  for (const i of items) counts[i.estado]++;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader icon={EyeOff} tema="Acceso a la información" titulo="Lo que el Estado no publica">
        {items.length} datos que deberían ser públicos y no lo son. Cualquier persona puede pedirlos y el Estado está
        obligado a responder.
      </PageHeader>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2">
          {(Object.keys(counts) as NoPublicado["estado"][]).map((e) =>
            counts[e] ? (
              <span key={e} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className={`size-2 rounded-full ${ESTADOS[e].dot}`} aria-hidden />
                {counts[e]} {ESTADOS[e].label.toLowerCase()}
              </span>
            ) : null,
          )}
        </div>
        <Segmented
          label="Categoría"
          options={[
            { value: "todas" as const, label: `Todas (${items.length})` },
            ...present.map((c) => ({ value: c, label: `${NO_PUBLICADO_CATEGORIES[c].label} (${items.filter((i) => i.categoria === c).length})` })),
          ]}
          value={category}
          onChange={setCategory}
        />
      </div>

      {groups.map((c) => {
        const cat = NO_PUBLICADO_CATEGORIES[c];
        const Icon = cat.icon;
        return (
          <section key={c} className="flex flex-col gap-3" aria-labelledby={`cat-${c}`}>
            <div className="flex items-start gap-3">
              <Icon className="mt-1 size-5 shrink-0 text-ink-muted" aria-hidden />
              <div className="flex min-w-0 flex-col">
                <h2 id={`cat-${c}`} className="text-lg font-semibold tracking-tight">
                  {cat.label}
                </h2>
                <p className="text-sm text-ink-muted">{cat.description}</p>
              </div>
            </div>
            <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl bg-tile">
              {items
                .filter((i) => i.categoria === c)
                .map((item) => (
                  <li key={item.id} id={item.id} className="scroll-mt-8">
                    <button
                      type="button"
                      onClick={() => setAbierto(item)}
                      className="group flex w-full items-center gap-4 px-4 py-4 text-left hover:bg-grid/50 sm:px-5"
                    >
                      <span className={`size-2.5 shrink-0 rounded-full ${ESTADOS[item.estado].dot}`} aria-hidden />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="font-medium group-hover:text-link">{item.titulo}</span>
                        <span className="truncate text-sm text-ink-muted">
                          {ESTADOS[item.estado].label} · {item.organismo}
                        </span>
                      </span>
                      <span className="hidden items-center gap-1 text-sm font-medium text-link sm:inline-flex">
                        Pedir <ChevronRight className="size-4" aria-hidden />
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-ink-muted sm:hidden" aria-hidden />
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        );
      })}

      <p className="text-sm text-ink-muted text-pretty">
        Cómo funciona: elegí un dato, copiá el pedido que armamos y presentalo gratis en el formulario oficial. El
        organismo tiene 15 días hábiles para responder (
        <a href={LEY_9070} target="_blank" rel="noreferrer" className="underline hover:text-link">
          Ley 9070
        </a>
        ). Revisamos los sitios oficiales el 11 de octubre de 2026.
      </p>

      {abierto && <DetalleSheet item={abierto} onClose={() => setAbierto(null)} />}
    </div>
  );
}

function armarPedido(item: NoPublicado) {
  return `Señores ${item.organismo}:

En el marco de la Ley provincial 9070 de Acceso a la Información Pública, solicito la siguiente información:

${item.pedido}

Solicito que la información se entregue en formato digital y, cuando se trate de datos, en un formato abierto y reutilizable (CSV o XLSX).

Saludos cordiales,
[Tu nombre y apellido]
[Tu DNI]
[Tu correo electrónico]`;
}

function DetalleSheet({ item, onClose }: { item: NoPublicado; onClose: () => void }) {
  const [texto, setTexto] = useState(() => armarPedido(item));
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <Sheet titulo="Pedir este dato" onClose={onClose}>
      <div className="flex flex-col gap-2">
        <span className="inline-flex w-fit items-center gap-1.5 text-xs text-ink-muted">
          <span className={`size-2 rounded-full ${ESTADOS[item.estado].dot}`} aria-hidden />
          {ESTADOS[item.estado].label}
        </span>
        <h3 className="text-xl font-semibold tracking-tight text-balance">{item.titulo}</h3>
        <p className="text-ink-2 text-pretty">{item.que_es}</p>
      </div>

      <Aviso titulo="Por qué importa">
        {item.por_que_importa}
        {item.detalle_estado && <p className="mt-1 text-ink-muted">{item.detalle_estado}</p>}
      </Aviso>

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-medium">Tu pedido</span>
          <span className="text-xs text-ink-muted">Completá tus datos al final</span>
        </div>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={13}
          aria-label="Texto del pedido"
          className="w-full resize-y rounded-lg border border-line bg-page p-3 font-sans text-sm leading-relaxed text-ink outline-none focus:border-link"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copiar}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm hover:border-link/50"
          >
            {copiado ? <Check className="size-4 text-good" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copiado ? "Copiado" : "1. Copiar pedido"}
          </button>
          <a
            href={FORMULARIO}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-on-brand hover:bg-brand-hover"
          >
            2. Presentarlo en el formulario oficial <ExternalLink className="size-4" aria-hidden />
          </a>
        </div>
        <p className="text-xs text-ink-muted text-pretty">
          Para: {item.organismo}. Guardá el número de trámite que te den: si no responden en 15 días hábiles, podés
          reclamar.
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-4 text-sm">
        <span className="text-ink-muted">Qué lo respalda: {item.marco_legal}</span>
        <span className="text-ink-muted">Dónde lo buscamos:</span>
        <div className="flex flex-wrap gap-2">
          {item.donde_buscamos.map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-link hover:underline"
            >
              <Search className="size-3.5" aria-hidden /> {new URL(url).hostname.replace(/^www\./, "")}
            </a>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
