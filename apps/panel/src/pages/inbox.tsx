import { Alert } from "@mt/ui/components/alert";
import { buttonClassName } from "@mt/ui/components/base/buttons/button";
import { IconButton } from "@mt/ui/components/base/buttons/icon-button";
import { InputBase, TextField } from "@mt/ui/components/base/input/input";
import { Label } from "@mt/ui/components/base/input/label";
import { Kbd } from "@mt/ui/components/base/kbd/kbd";
import { SearchInput } from "@mt/ui/components/search-input";
import { Segmented } from "@mt/ui/components/segmented";
import { Sheet } from "@mt/ui/components/sheet";
import { useMediaQuery } from "@mt/ui/hooks/use-media-query";
import { RiDownloadLine, RiInbox2Line, RiRefreshLine } from "@remixicon/react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { api, type Counts, type InboxItem, type ReviewStatus, type SubmissionType, useApi } from "../api.ts";
import { InboxList } from "../components/inbox-list.tsx";
import { ScreenHeader } from "../components/layout.tsx";
import { SubmissionPanel } from "../components/submission-panel.tsx";
import { REVIEW_TABS, TYPE_FILTERS } from "../labels.ts";

export interface InboxSearch {
  estado?: string;
  tipo?: string;
  q?: string;
  desde?: string;
  hasta?: string;
  envio?: string;
}

export function InboxPage() {
  const search = useSearch({ from: "/bandeja" });
  const navigate = useNavigate({ from: "/bandeja" });
  const set = (patch: Partial<InboxSearch>) =>
    void navigate({ search: (s: InboxSearch) => ({ ...s, ...patch }), replace: true, resetScroll: false });

  const status = (REVIEW_TABS.find((t) => t.value === search.estado)?.value ?? "new") as ReviewStatus | "all";
  const type = (TYPE_FILTERS.find((t) => t.value === search.tipo)?.value ?? "all") as SubmissionType | "all";
  const [q, setQ] = useState(search.q ?? "");
  // The search goes to the URL (and the API) when typing stops.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the text changes (set is a new function each render)
  useEffect(() => {
    const t = setTimeout(() => set({ q: q.trim() || undefined }), 300);
    return () => clearTimeout(t);
  }, [q]);

  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (type !== "all") params.set("type", type);
  if (search.q) params.set("q", search.q);
  if (search.desde) params.set("from", search.desde);
  if (search.hasta) params.set("to", search.hasta);
  const query = params.toString();
  const inbox = useApi<{ items: InboxItem[]; counts: Counts }>(`/api/panel/inbox?${query}`);
  const items = inbox.data?.items ?? [];
  const open = search.envio ?? null;
  // On a wide screen the submission opens beside the list; on a phone, in a sheet over it.
  const desktop = useMediaQuery("(min-width: 1024px)");
  const openItem = (code: string | null) => set({ envio: code ?? undefined });

  // Keyboard, like a mail inbox: j/k move, e resolves, # discards, / searches. Never while typing.
  const searchRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || target.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      const index = items.findIndex((i) => i.code === open);
      if (e.key === "j" || e.key === "k") {
        const next = items[Math.min(items.length - 1, Math.max(0, index + (e.key === "j" ? 1 : -1)))];
        if (next) openItem(next.code);
      } else if ((e.key === "e" || e.key === "#") && open) {
        void api(`/api/panel/items/${open}`, { method: "PATCH", body: { reviewStatus: e.key === "e" ? "resolved" : "discarded" } }).then(
          inbox.reload,
        );
      } else if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.querySelector("input")?.focus();
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const counts = inbox.data?.counts;
  const detail = open && <SubmissionPanel key={open} code={open} onChange={inbox.reload} />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader title="Bandeja">
        <IconButton icon={RiRefreshLine} aria-label="Actualizar" onClick={inbox.reload} />
        <a href={`/api/panel/export.csv?${query}`} className={buttonClassName({ variant: "secondary" })} download>
          <RiDownloadLine className="size-4" aria-hidden /> Exportar CSV
        </a>
      </ScreenHeader>

      <div className="flex flex-col gap-3 border-separator-border border-b px-4 py-3 lg:px-6">
        <Segmented
          label="Estado de revisión"
          options={REVIEW_TABS.map((t) => ({ value: t.value, label: counts ? `${t.label} ${counts[t.value]}` : t.label }))}
          value={status}
          onChange={(v) => set({ estado: v === "new" ? undefined : v, envio: undefined })}
        />
        <div className="flex flex-wrap items-end gap-3">
          <div ref={searchRef} className="w-full sm:w-80">
            <SearchInput label="Buscar envíos" value={q} onChange={setQ} placeholder="Código, texto, correo, trámite o etiqueta" />
          </div>
          <Segmented
            label="Tipo de envío"
            options={TYPE_FILTERS}
            value={type}
            onChange={(v) => set({ tipo: v === "all" ? undefined : v })}
          />
          <DateFilter label="Desde" value={search.desde} onChange={(v) => set({ desde: v })} />
          <DateFilter label="Hasta" value={search.hasta} onChange={(v) => set({ hasta: v })} />
        </div>
      </div>

      {inbox.error && (
        <div className="p-4">
          <Alert title="No se pudo cargar la bandeja">{inbox.error}</Alert>
        </div>
      )}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(20rem,26rem)_1fr]">
        <section aria-label="Envíos" className="flex min-w-0 flex-col border-separator-border lg:border-r">
          <div className="flex min-h-11 items-center justify-between gap-3 border-separator-border border-b px-4 text-body-regular text-text-secondary">
            <span className="whitespace-nowrap">
              {inbox.data ? `${items.length} ${items.length === 1 ? "envío" : "envíos"}` : "Cargando…"}
            </span>
            <span className="hidden items-center gap-1 whitespace-nowrap text-caption-1-regular text-text-tertiary xl:flex">
              <Kbd>j</Kbd> <Kbd>k</Kbd> moverse · <Kbd>e</Kbd> resolver · <Kbd>#</Kbd> descartar · <Kbd>/</Kbd> buscar
            </span>
          </div>
          {inbox.data && items.length === 0 ? (
            <p className="p-6 text-body-regular text-text-tertiary text-pretty">
              No hay envíos con estos filtros. Probá con «Todos» o borrá la búsqueda.
            </p>
          ) : (
            <InboxList items={items} selected={open} onSelect={openItem} />
          )}
        </section>
        <section aria-label="Envío abierto" className="hidden min-w-0 lg:block">
          {open && desktop ? detail : <EmptyDetail />}
        </section>
      </div>
      {open && !desktop && (
        <Sheet title={open} onClose={() => openItem(null)}>
          {detail}
        </Sheet>
      )}
    </div>
  );
}

function EmptyDetail() {
  return (
    <div className="flex h-full min-h-80 flex-col items-center justify-center gap-3 p-8 text-center">
      <RiInbox2Line className="size-8 text-foreground-icon-secondary" aria-hidden />
      <p className="text-headline-semibold">Elegí un envío</p>
      <p className="max-w-sm text-body-regular text-text-secondary text-pretty">
        Abrí un pedido o un reporte de la lista para revisarlo, publicarlo o descartarlo.
      </p>
    </div>
  );
}

function DateFilter({ label, value, onChange }: { label: string; value?: string; onChange: (v: string | undefined) => void }) {
  return (
    <TextField className="flex w-40 flex-col gap-1.5" value={value ?? ""} onChange={(v) => onChange(v || undefined)}>
      <Label>{label}</Label>
      <InputBase type="date" />
    </TextField>
  );
}
