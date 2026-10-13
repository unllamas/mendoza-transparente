import { Alert } from "@mt/ui/components/alert";
import { buttonClassName } from "@mt/ui/components/base/buttons/button";
import { tileVariants } from "@mt/ui/components/card";
import { Textarea } from "@mt/ui/components/input";
import { PageHeader } from "@mt/ui/components/section";
import { cn } from "@mt/ui/lib/utils";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Check, ChevronRight, Copy, ExternalLink, EyeOff, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { TrackedSheet } from "@/components/tracked-sheet.tsx";
import { type RequestStats, useRequestStats } from "@/features/participation/api/request-stats.ts";
import { NO_PUBLICADO_CATEGORIES, NO_PUBLICADO_THEMES, type NoPublicadoTheme } from "@/no-publicado-categories.ts";
import type { NoPublicado } from "@/types.ts";
import { useUrlText } from "@/url-state.ts";

const route = getRouteApi("/no-publicado");

const FORMULARIO = "https://ticketsform.mendoza.gov.ar/ticketsform/servlet/responderformulario?AIP_SOLICITUDINFORMACIONPUBLICA";
const LEY_9070 = "https://media.mendoza.gob.ar/principal/uploads/2025/08/Ley-de-Acceso-a-la-Informacion-Publica-9070-1.pdf";

// Estado con punto de color y texto: el color nunca va solo.
const ESTADOS: Record<NoPublicado["estado"], { label: string; dot: string }> = {
  sin_publicar: { label: "Sin publicar", dot: "bg-critical" },
  parcial: { label: "Publicado en parte", dot: "bg-warning" },
  desactualizado: { label: "Desactualizado", dot: "bg-warning" },
};

const PLURAL: Record<NoPublicado["estado"], string> = {
  sin_publicar: "sin publicar",
  parcial: "publicados en parte",
  desactualizado: "desactualizados",
};

export function NoPublicadoPage() {
  const items = route.useLoaderData();
  // The open item (?dato=nomina-sueldos) and the theme (?tema=plata) live in the URL, like ?senal= in /senales.
  const [openId, setOpenId] = useUrlText("dato");
  const abierto = items.find((i) => i.id === openId) ?? null;
  const setAbierto = (item: NoPublicado | null) => setOpenId(item?.id ?? null);
  const [themeId, setThemeId] = useUrlText("tema");
  const theme = (NO_PUBLICADO_THEMES.find((t) => t.id === themeId)?.id ?? null) as NoPublicadoTheme | null;
  const setTheme = (t: NoPublicadoTheme | null) => setThemeId(t);
  const stats = useRequestStats();

  // Old links with a hash (/no-publicado#nomina-sueldos) still open their item.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id || !items.some((i) => i.id === id)) return;
    // Drop the hash first, so closing the sheet leaves a clean URL.
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    setOpenId(id);
  }, [items, setOpenId]);

  const inTheme = (t: (typeof NO_PUBLICADO_THEMES)[number]) =>
    items.filter((i) => (t.categories as readonly string[]).includes(i.categoria));
  const themes = NO_PUBLICADO_THEMES.filter((t) => inTheme(t).length > 0);
  const shown = theme ? themes.filter((t) => t.id === theme) : themes;
  const counts = { sin_publicar: 0, parcial: 0, desactualizado: 0 };
  for (const i of items) counts[i.estado]++;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader icon={EyeOff} topic="Acceso a la información" title="Lo que el Estado no publica">
        {items.length} datos que deberían ser públicos y no lo son. Cualquier persona puede pedirlos y el Estado está obligado a responder.
      </PageHeader>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2">
          {(Object.keys(counts) as NoPublicado["estado"][]).map((e) =>
            counts[e] ? (
              <span key={e} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className={`size-2 rounded-full ${ESTADOS[e].dot}`} aria-hidden />
                {counts[e]} {counts[e] === 1 ? ESTADOS[e].label.toLowerCase() : PLURAL[e]}
              </span>
            ) : null,
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="group" aria-label="Filtrar por tema">
          {themes.map((t) => {
            const Icon = t.icon;
            const active = theme === t.id;
            return (
              <button
                key={t.id}
                id={`tema-filtro-${t.id}`}
                type="button"
                aria-pressed={active}
                data-track="missing_data.theme.toggle"
                data-track-theme={t.id}
                data-track-active={String(!active)}
                onClick={() => setTheme(active ? null : t.id)}
                className={`flex min-w-0 flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors sm:p-4 ${
                  active ? "border-brand bg-brand/10" : "border-line hover:border-link"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <Icon className={`size-5 shrink-0 ${active ? "text-link" : "text-ink-muted"}`} aria-hidden />
                  <span className="text-lg font-semibold tabular-nums">{inTheme(t).length}</span>
                </span>
                <span className="text-sm font-medium text-balance">{t.label}</span>
                <span className="hidden text-xs text-ink-muted sm:block">{t.description}</span>
              </button>
            );
          })}
        </div>
        {theme && (
          <button
            type="button"
            id="tema-filtro-todos"
            onClick={() => setTheme(null)}
            data-track="missing_data.theme.clear"
            className="w-fit text-sm text-link hover:underline"
          >
            Ver todos los temas
          </button>
        )}
      </div>

      {shown.map((t) => (
        <section key={t.id} className="flex flex-col gap-3" aria-labelledby={`tema-${t.id}`}>
          <h2 id={`tema-${t.id}`} className="text-lg font-semibold tracking-tight">
            {t.label}
          </h2>
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl bg-tile">
            {inTheme(t).map((item) => (
              <li key={item.id} id={item.id} className="scroll-mt-8">
                <button
                  type="button"
                  id={`pedido-abrir-${item.id}`}
                  onClick={() => setAbierto(item)}
                  data-track="missing_data.request.open"
                  data-track-item={item.id}
                  data-track-theme={t.id}
                  className="group flex w-full items-center gap-4 px-4 py-4 text-left hover:bg-grid/50 sm:px-5"
                >
                  <span className={`size-2.5 shrink-0 rounded-full ${ESTADOS[item.estado].dot}`} aria-hidden />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-medium group-hover:text-link">{item.titulo}</span>
                    <span className="truncate text-sm text-ink-muted">
                      {NO_PUBLICADO_CATEGORIES[item.categoria].label} · {ESTADOS[item.estado].label}
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
      ))}

      <p className="text-sm text-ink-muted text-pretty">
        Cómo funciona: elegí un dato, copiá el pedido que armamos y presentalo gratis en el formulario oficial. El organismo tiene 15 días
        hábiles para responder (
        <a href={LEY_9070} target="_blank" rel="noreferrer" data-track="missing_data.law.open" className="underline hover:text-link">
          Ley 9070
        </a>
        ). Revisamos los sitios oficiales el 11 de octubre de 2026.
      </p>

      {abierto && <DetalleSheet item={abierto} stats={stats?.items[abierto.id] ?? null} onClose={() => setAbierto(null)} />}
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

function DetalleSheet({ item, stats, onClose }: { item: NoPublicado; stats: RequestStats["items"][string] | null; onClose: () => void }) {
  const [texto, setTexto] = useState(() => armarPedido(item));
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <TrackedSheet title="Pedir este dato" onClose={onClose} trackId="missing_data.request">
      <div className="flex flex-col gap-2">
        <span className="inline-flex w-fit items-center gap-1.5 text-xs text-ink-muted">
          <span className={`size-2 rounded-full ${ESTADOS[item.estado].dot}`} aria-hidden />
          {ESTADOS[item.estado].label}
        </span>
        <h3 className="text-xl font-semibold tracking-tight text-balance">{item.titulo}</h3>
        <p className="text-ink-2 text-pretty">{item.que_es}</p>
      </div>

      <Alert title="Por qué importa">
        {item.por_que_importa}
        {item.detalle_estado && <p className="mt-1 text-ink-muted">{item.detalle_estado}</p>}
      </Alert>

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-medium">Tu pedido</span>
          <span className="text-xs text-ink-muted">Completá tus datos al final</span>
        </div>
        <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={13} aria-label="Texto del pedido" className="bg-page" />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copiar}
            id="pedido-copiar"
            data-track="missing_data.request.copy"
            data-track-item={item.id}
            data-track-edited={String(texto !== armarPedido(item))}
            className={buttonClassName({ variant: "secondary" })}
          >
            {copiado ? <Check className="size-4 text-good" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copiado ? "Copiado" : "1. Copiar pedido"}
          </button>
          <a
            href={FORMULARIO}
            id="pedido-formulario-oficial"
            data-track="missing_data.request.official_form"
            data-track-item={item.id}
            target="_blank"
            rel="noreferrer"
            className={buttonClassName({ variant: "primary" })}
          >
            2. Presentarlo en el formulario oficial <ExternalLink className="size-4" aria-hidden />
          </a>
        </div>
        <p className="text-xs text-ink-muted text-pretty">
          Para: {item.organismo}. Guardá el número de trámite que te den: si no responden en 15 días hábiles, podés reclamar.
        </p>
      </div>

      <div className={cn(tileVariants(), "flex flex-col gap-2 text-sm")}>
        <span className="font-medium">¿Ya lo presentaste?</span>
        <span className="text-ink-2 text-pretty">
          {stats && stats.requests > 0
            ? `${stats.requests} ${stats.requests === 1 ? "persona ya lo pidió" : "personas ya lo pidieron"}: ${stats.answered} con respuesta y ${stats.denied + stats.overdue} negados o sin respuesta en plazo.`
            : "Registrá tu número de trámite: así contamos cuántas personas lo piden y cuánto responde el Estado."}
        </span>
        <Link
          to="/participar"
          search={{ tipo: "pedido", dato: item.id }}
          id="pedido-registrar-tramite"
          data-track="missing_data.request.register_filing"
          data-track-item={item.id}
          className="inline-flex w-fit items-center gap-1 font-medium text-link hover:underline"
        >
          Registrar mi número de trámite <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-4 text-sm">
        <span className="text-ink-muted">Qué lo respalda: {item.marco_legal}</span>
        <span className="text-ink-muted">Dónde lo buscamos:</span>
        <div className="flex flex-wrap gap-2">
          {item.donde_buscamos.map((url) => (
            <a
              key={url}
              data-track="missing_data.request.where_we_looked"
              data-track-item={item.id}
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
    </TrackedSheet>
  );
}
