import { getRouteApi } from "@tanstack/react-router";
import { Check, Copy, ExternalLink, EyeOff, FileText, Search, Send } from "lucide-react";
import { useState } from "react";

import type { NoPublicado } from "../types.ts";
import { PageHeader, Sheet } from "./components.tsx";

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
  const [pidiendo, setPidiendo] = useState<NoPublicado | null>(null);

  return (
    <div className="flex flex-col gap-12">
      <PageHeader icon={EyeOff} tema="Acceso a la información" titulo="Lo que el Estado no publica">
        Datos que deberían ser públicos y no encontramos en ningún sitio oficial. Cualquier persona puede pedirlos: la
        Ley 9070 obliga al Estado provincial a responder.
      </PageHeader>

      <ol className="grid gap-3 md:grid-cols-3">
        {[
          { icon: FileText, titulo: "Elegí un dato", texto: "Tocá «Pedilo vos» y revisá el pedido que armamos." },
          { icon: Send, titulo: "Presentalo", texto: "Copialo y pegalo en el formulario oficial del Gobierno. Es gratis." },
          {
            icon: Check,
            titulo: "Esperá la respuesta",
            texto: "El organismo tiene 15 días hábiles para responder. Guardá el número de trámite.",
          },
        ].map((paso, i) => (
          <li key={paso.titulo} className="flex flex-col gap-2 rounded-xl bg-tile p-4">
            <span className="flex items-center gap-2 text-sm text-ink-muted">
              <paso.icon className="size-4 text-accent" aria-hidden /> Paso {i + 1}
            </span>
            <span className="font-medium">{paso.titulo}</span>
            <span className="text-sm text-ink-2 text-pretty">{paso.texto}</span>
          </li>
        ))}
      </ol>

      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id} id={item.id} className="flex scroll-mt-8 flex-col gap-4 rounded-2xl bg-tile p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex max-w-2xl flex-col gap-1.5">
                <h2 className="text-lg font-semibold tracking-tight text-balance">{item.titulo}</h2>
                <p className="text-ink-2 text-pretty">{item.que_es}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs font-medium whitespace-nowrap text-ink-2">
                <span className={`size-2 rounded-full ${ESTADOS[item.estado].dot}`} aria-hidden />
                {ESTADOS[item.estado].label}
              </span>
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-ink-muted">Por qué importa</dt>
                <dd className="text-pretty">{item.por_que_importa}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-ink-muted">Quién debería publicarlo</dt>
                <dd>{item.organismo}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-ink-muted">Qué lo respalda</dt>
                <dd className="text-pretty">{item.marco_legal}</dd>
              </div>
            </dl>
            {item.detalle_estado && <p className="text-sm text-ink-muted text-pretty">{item.detalle_estado}</p>}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPidiendo(item)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-page hover:opacity-90"
              >
                <Send className="size-4" aria-hidden /> Pedilo vos
              </button>
              {item.donde_buscamos.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-ink-2 hover:border-axis hover:text-ink"
                >
                  <Search className="size-3.5" aria-hidden /> {new URL(url).hostname.replace(/^www\./, "")}
                </a>
              ))}
              {item.pedidos.length > 0 && (
                <span className="text-sm text-ink-muted">{item.pedidos.length} pedidos presentados por el proyecto</span>
              )}
            </div>
          </li>
        ))}
      </ul>

      <p className="text-sm text-ink-muted text-pretty">
        Revisamos los sitios oficiales el 11 de octubre de 2026. Si encontrás alguno de estos datos publicado, avisanos y
        lo actualizamos. Texto de la{" "}
        <a href={LEY_9070} className="underline hover:text-ink">
          Ley 9070 de Acceso a la Información Pública
        </a>
        .
      </p>

      {pidiendo && <PedidoSheet item={pidiendo} onClose={() => setPidiendo(null)} />}
    </div>
  );
}

function armarPedido(item: NoPublicado) {
  return `Señores ${item.organismo}:

En el marco de la Ley provincial 9070 de Acceso a la Información Pública, solicito la siguiente información:

${item.pedido}

Solicito que la información se entregue en formato digital y, cuando se trate de datos, en un formato abierto y reutilizable (CSV o XLSX).

Quedo a disposición para cualquier aclaración.

Saludos cordiales,
[Tu nombre y apellido]
[Tu DNI]
[Tu correo electrónico]`;
}

function PedidoSheet({ item, onClose }: { item: NoPublicado; onClose: () => void }) {
  const [texto, setTexto] = useState(() => armarPedido(item));
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <Sheet titulo="Pedido de acceso a la información" onClose={onClose}>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">Dato solicitado</span>
        <h3 className="text-lg font-semibold tracking-tight text-balance">{item.titulo}</h3>
        <span className="text-sm text-ink-2">Para: {item.organismo}</span>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">Texto del pedido</span>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={16}
          className="w-full resize-y rounded-lg border border-line bg-page p-3 font-sans text-sm leading-relaxed text-ink outline-none focus:border-axis"
        />
        <span className="text-xs text-ink-muted">Completá tus datos al final. Podés editar todo el texto.</span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copiar}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm hover:border-axis"
        >
          {copiado ? <Check className="size-4 text-good" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copiado ? "Copiado" : "Copiar texto"}
        </button>
        <a
          href={FORMULARIO}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-page hover:opacity-90"
        >
          Ir al formulario oficial <ExternalLink className="size-4" aria-hidden />
        </a>
      </div>

      <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-ink-2">
        <li>Copiá el texto y abrí el formulario oficial de solicitud de información pública del Gobierno de Mendoza.</li>
        <li>Pegá el pedido en la descripción y completá tus datos. Puede pedirte crear un usuario.</li>
        <li>Guardá el número de trámite: con él podés reclamar si no te responden en 15 días hábiles.</li>
      </ol>
    </Sheet>
  );
}
