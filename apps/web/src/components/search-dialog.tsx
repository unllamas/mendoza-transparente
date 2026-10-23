/**
 * Advanced search: a dialog over everything (full screen on phones, a centered panel on desktop) with results
 * grouped by kind and filters by kind. Opened from the home page, the header search button, or "/" and
 * Ctrl/⌘+K anywhere. Mounted once in the layout; the index (data/search.json, scripts/temas/guide.ts) is
 * downloaded the first time it opens.
 */

import { PersonAvatar } from "@mt/ui/components/avatar";
import { buttonClassName } from "@mt/ui/components/base/buttons/button";
import { IconButton } from "@mt/ui/components/base/buttons/icon-button";
import { cardVariants } from "@mt/ui/components/card";
import { Dialog } from "@mt/ui/components/dialog";
import { cx } from "@mt/ui/lib/cx";
import {
  type RemixiconComponentType,
  RiAlertLine,
  RiArrowRightLine,
  RiBankLine,
  RiBuilding2Line,
  RiCloseLine,
  RiCornerDownLeftLine,
  RiDatabase2Line,
  RiEyeOffLine,
  RiFlagLine,
  RiHistoryLine,
  RiLayoutGridLine,
  RiMapPinLine,
  RiScales3Line,
  RiSearchLine,
  RiShoppingCartLine,
  RiStore2Line,
  RiTeamLine,
} from "@remixicon/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { track } from "@/analytics.ts";
import type { SearchEntry } from "@/types.ts";

// ------------------------------------------------------------------ index and matching

let searchIndex: Promise<SearchEntry[]> | null = null;
const loadSearchIndex = () =>
  (searchIndex ??= fetch("/data/search.json")
    .then((r) => (r.ok ? (r.json() as Promise<SearchEntry[]>) : []))
    .catch(() => {
      searchIndex = null;
      return [];
    }));

/** Lowercase, no accents, and "9.735" → "9735" so law numbers match with or without dots. */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/(\d)\.(?=\d)/g, "$1");

/** People, places and laws first: they are what most searches are about. */
const KIND_WEIGHT: Record<string, number> = {
  Municipio: 6,
  Funcionario: 5,
  Partido: 5,
  "Ex funcionario": 4,
  Ley: 4,
  Organismo: 4,
  Señal: 4,
  "No se publica": 3,
  Proveedor: 3,
  Sección: 3,
};

/** Result groups, in the order the filters show them: plural label and icon. */
const GROUPS: { kind: string; label: string; icon: RemixiconComponentType }[] = [
  { kind: "Funcionario", label: "Funcionarios", icon: RiTeamLine },
  { kind: "Partido", label: "Partidos, frentes y bloques", icon: RiFlagLine },
  { kind: "Ex funcionario", label: "Ex funcionarios y electos", icon: RiHistoryLine },
  { kind: "Municipio", label: "Municipios", icon: RiMapPinLine },
  { kind: "Ley", label: "Leyes", icon: RiScales3Line },
  { kind: "Organismo", label: "Organismos", icon: RiBuilding2Line },
  { kind: "Proveedor", label: "Proveedores", icon: RiStore2Line },
  { kind: "Área que compra", label: "Áreas que compran", icon: RiShoppingCartLine },
  { kind: "Cargo", label: "Cargos", icon: RiBankLine },
  { kind: "Señal", label: "Para mirar de cerca", icon: RiAlertLine },
  { kind: "No se publica", label: "Lo que no se publica", icon: RiEyeOffLine },
  { kind: "Datos abiertos", label: "Datos abiertos", icon: RiDatabase2Line },
  { kind: "Sección", label: "Secciones", icon: RiLayoutGridLine },
];
const groupOf = (kind: string) => GROUPS.find((g) => g.kind === kind) ?? { kind, label: kind, icon: RiLayoutGridLine };
const PER_GROUP = 3;
const MAX_FILTERED = 50;

function match(entries: SearchEntry[], query: string): SearchEntry[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored: [number, SearchEntry][] = [];
  for (const e of entries) {
    const title = fold(e.t);
    const all = `${title} ${fold(e.s)} ${fold(e.q ?? "")}`;
    // "ecoclean" finds "ECO CLEAN S.A.S." and "acp" finds "A.C.P.": also compare without spaces or dots.
    const compact = all.replace(/[\s.-]/g, "");
    if (!words.every((w) => all.includes(w) || compact.includes(w.replace(/[.-]/g, "")))) continue;
    let score = KIND_WEIGHT[e.k] ?? 1;
    if (words.every((w) => title.includes(w))) score += 20;
    if (title.startsWith(words[0]!)) score += 15;
    if (words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(title))) score += 5;
    scored.push([score, e]);
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].t.length - b[1].t.length).map(([, e]) => e);
}

// ------------------------------------------------------------------ opening

const OPEN_EVENT = "mt:open-search";
/** Opens the search dialog from anywhere. `source` is only for analytics. */
export const openSearch = (source: string) => window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: source }));

/** Looks like a search box; opens the dialog (home page). */
export function SearchTrigger() {
  return (
    <button
      type="button"
      id="buscador-global"
      onClick={() => openSearch("home")}
      className={cx(cardVariants(), "flex w-full max-w-2xl items-center gap-3 text-headline-regular text-text-tertiary")}
    >
      <RiSearchLine className="size-5 shrink-0 text-text-link" aria-hidden />
      <span className="truncate">Buscá funcionarios, leyes, empresas…</span>
      <kbd className="ml-auto hidden shrink-0 rounded border border-separator-border px-1.5 py-0.5 font-sans text-caption-1-regular text-text-tertiary sm:block">
        /
      </kbd>
    </button>
  );
}

/** Search button for the header, on every page. */
export function HeaderSearchButton() {
  return <IconButton icon={RiSearchLine} aria-label="Buscar" onClick={() => openSearch("header")} id="buscador-header" />;
}

// ------------------------------------------------------------------ dialog

const EXAMPLES = ["Cornejo", "Ley 9735", "Maipú", "Hospital Central", "ECO CLEAN", "Vialidad"];
const SHORTCUTS: { label: string; to: string; icon: RemixiconComponentType }[] = [
  { label: "Funcionarios", to: "/funcionarios", icon: RiTeamLine },
  { label: "Municipios", to: "/municipios", icon: RiMapPinLine },
  { label: "Leyes", to: "/leyes", icon: RiScales3Line },
  { label: "Gobierno por dentro", to: "/gobierno", icon: RiBuilding2Line },
  { label: "Proveedores", to: "/proveedores", icon: RiStore2Line },
  { label: "Lo que no se publica", to: "/no-publicado", icon: RiLayoutGridLine },
];

export function SearchDialog() {
  const navigate = useNavigate();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<string | null>(null);
  const [entries, setEntries] = useState<SearchEntry[] | null>(null);
  const [active, setActive] = useState(0);
  // Where it was opened from (home, header, keyboard, guide), so a result can be credited to its entry point.
  const sourceRef = useRef("unknown");

  // Open from the custom event and with "/" or Ctrl/⌘+K (not while typing in a field).
  useEffect(() => {
    const show = (source: string) => {
      setOpen(true);
      sourceRef.current = source;
      track("search.open", { source });
      void loadSearchIndex().then(setEntries);
    };
    const onOpen = (e: Event) => show((e as CustomEvent<string>).detail);
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        show("keyboard");
      }
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 0);
  }, [open]);

  const q = query.trim();
  const matches = useMemo(() => (entries ? match(entries, q) : []), [entries, q]);
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const e of matches) c.set(e.k, (c.get(e.k) ?? 0) + 1);
    return c;
  }, [matches]);
  // Without a filter: grouped, a few per kind, groups by best match. With a filter: that kind only.
  const groups = useMemo(() => {
    if (kind) return [{ kind, items: matches.filter((e) => e.k === kind).slice(0, MAX_FILTERED) }];
    const order: string[] = [];
    for (const e of matches) if (!order.includes(e.k)) order.push(e.k);
    return order.map((k) => ({ kind: k, items: matches.filter((e) => e.k === k).slice(0, PER_GROUP) }));
  }, [matches, kind]);
  const results = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: back to the first result when the query or the filter changes.
  useEffect(() => setActive(0), [q, kind]);
  useEffect(() => {
    if (!entries || q.length < 3 || matches.length) return;
    const t = setTimeout(() => track("search.no_results", { query: q.slice(0, 80), source: sourceRef.current }), 1200);
    return () => clearTimeout(t);
  }, [entries, q, matches.length]);

  const close = () => {
    setOpen(false);
    setQuery("");
    setKind(null);
  };
  const go = (e: SearchEntry, position: number) => {
    track("search.select", { query: q.slice(0, 80), kind: e.k, path: e.p, position, filter: kind ?? "todo", source: sourceRef.current });
    close();
    // `href`, not `to`: some results carry parameters (/senales?senal=…, /no-publicado?dato=…).
    void navigate({ href: e.p });
  };
  const choose = (k: string | null) => {
    setKind(k);
    track("search.filter", { kind: k ?? "todo" });
    input.current?.focus();
  };

  // Opening the search puts the cursor in the field (React Aria keeps focus that is already inside the dialog).
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <Dialog
      label="Buscar"
      onClose={close}
      overlayClassName="z-[60] sm:bg-black/60 sm:backdrop-blur-[2px]"
      className="inset-0 z-[60] flex flex-col overflow-hidden bg-background-full sm:inset-auto sm:top-[10vh] sm:left-1/2 sm:max-h-[80vh] sm:w-[calc(100%-3rem)] sm:max-w-2xl sm:-translate-x-1/2 sm:rounded-2xl sm:border sm:border-separator-border sm:bg-background-primary-default sm:shadow-2xl"
    >
      {/* Search box */}
      <div className="flex min-h-14 shrink-0 items-center gap-2 border-b border-separator-border pr-1.5 pl-3 sm:pl-4">
        <RiSearchLine className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          enterKeyHint="search"
          value={query}
          placeholder="Funcionarios, leyes, empresas, municipios…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && results[active]) {
              e.preventDefault();
              go(results[active], active);
            }
          }}
          className="min-w-0 flex-1 bg-transparent py-2 text-headline-regular text-text-primary !outline-none placeholder:text-text-tertiary [&::-webkit-search-cancel-button]:hidden"
        />
        {/* Phones: a "Cancelar" text button; desktop: a square close button. */}
        <button
          type="button"
          onClick={close}
          id="buscador-cerrar"
          data-track="search.close"
          className={buttonClassName({ variant: "tertiary", className: "shrink-0 sm:hidden" })}
        >
          Cancelar
        </button>
        <IconButton icon={RiCloseLine} aria-label="Cerrar" onClick={close} data-track="search.close" className="hidden sm:flex" />
      </div>

      {/* Filters by kind */}
      {q && matches.length > 0 && (
        <div
          className="flex shrink-0 gap-2 overflow-x-auto border-b border-separator-border px-3 py-2 [scrollbar-width:none] sm:px-4"
          role="radiogroup"
          aria-label="Filtrar por tipo"
        >
          <FilterChip active={kind === null} onClick={() => choose(null)} label={`Todo (${matches.length})`} />
          {GROUPS.filter((g) => counts.get(g.kind)).map((g) => (
            <FilterChip key={g.kind} active={kind === g.kind} onClick={() => choose(g.kind)} label={`${g.label} (${counts.get(g.kind)})`} />
          ))}
        </div>
      )}

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!q ? (
          <EmptyState onExample={(ex) => setQuery(ex)} onNavigate={close} />
        ) : !entries ? (
          <p className="px-4 py-4 text-body-regular text-text-tertiary">Buscando…</p>
        ) : results.length ? (
          <div id={listId} role="listbox" aria-label="Resultados" className="py-1">
            {groups.map((g) => {
              const group = groupOf(g.kind);
              const GroupIcon = group.icon;
              const total = counts.get(g.kind) ?? 0;
              return (
                <div key={g.kind} role="group" aria-label={group.label} className="border-b border-separator-border py-1 last:border-b-0">
                  {!kind && (
                    <div className="flex items-center gap-2 px-4 pt-2 pb-1 text-caption-1-medium tracking-wide text-text-tertiary uppercase">
                      <GroupIcon className="size-3.5" aria-hidden />
                      {group.label}
                    </div>
                  )}
                  {g.items.map((e) => {
                    const i = results.indexOf(e);
                    return (
                      <a
                        key={e.p}
                        href={e.p}
                        role="option"
                        aria-selected={i === active}
                        onClick={(ev) => {
                          ev.preventDefault();
                          go(e, i);
                        }}
                        onMouseEnter={() => setActive(i)}
                        className={cx(
                          "flex min-h-11 min-w-0 items-center gap-3 px-4 py-2.5",
                          i === active && "bg-background-secondary-default",
                        )}
                      >
                        {e.k === "Funcionario" && <PersonAvatar name={e.t} photo={e.i} className="size-9 text-caption-1-regular" />}
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className={cx("truncate text-body-medium", i === active && "text-text-link")}>{e.t}</span>
                          <span className="truncate text-body-regular text-text-tertiary">{e.s}</span>
                        </span>
                      </a>
                    );
                  })}
                  {!kind && total > g.items.length && (
                    <button
                      type="button"
                      onClick={() => choose(g.kind)}
                      className="flex min-h-11 w-full items-center gap-1 px-4 py-2 text-body-regular text-text-link hover:underline"
                    >
                      Ver {total === 1 ? "el resultado" : `los ${total}`} en {group.label.toLowerCase()}{" "}
                      <RiArrowRightLine className="size-3.5" aria-hidden />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-1 px-4 py-5 text-body-regular">
            <span>No encontramos nada con «{q}».</span>
            <span className="text-text-tertiary">
              Probá con otra palabra, o{" "}
              <Link to="/participar" search={{ tipo: "dato" }} onClick={close} className="text-text-link hover:underline">
                sugerinos ese dato
              </Link>
              .
            </span>
          </div>
        )}
      </div>

      {/* Keyboard hints (desktop) */}
      <div className="hidden shrink-0 items-center gap-4 border-t border-separator-border px-4 py-2 text-caption-1-regular text-text-tertiary sm:flex">
        <span className="inline-flex items-center gap-1">
          <kbd className="rounded border border-separator-border px-1">↑</kbd>
          <kbd className="rounded border border-separator-border px-1">↓</kbd> moverse
        </span>
        <span className="inline-flex items-center gap-1">
          <RiCornerDownLeftLine className="size-3.5" aria-hidden /> abrir
        </span>
        <span className="inline-flex items-center gap-1">
          <kbd className="rounded border border-separator-border px-1">esc</kbd> cerrar
        </span>
      </div>
    </Dialog>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={buttonClassName({ variant: active ? "primary" : "secondary", className: "shrink-0 whitespace-nowrap" })}
    >
      {label}
    </button>
  );
}

function EmptyState({ onExample, onNavigate }: { onExample: (q: string) => void; onNavigate: () => void }) {
  return (
    <div className="flex flex-col gap-6 px-4 py-5">
      <div className="flex flex-col gap-2">
        <span className="text-caption-1-medium tracking-wide text-text-tertiary uppercase">Probá con</span>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                track("search.example", { query: ex });
                onExample(ex);
              }}
              className={buttonClassName({ variant: "secondary" })}
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-caption-1-medium tracking-wide text-text-tertiary uppercase">O explorá</span>
        <ul className="grid gap-1 sm:grid-cols-2">
          {SHORTCUTS.map(({ label, to, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                onClick={onNavigate}
                data-track="search.shortcut"
                data-track-to={to}
                className="group flex min-h-11 items-center gap-3 rounded-2lg px-2 py-2.5 hover:bg-background-secondary-default"
              >
                <Icon className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
                <span className="text-text-link">{label}</span>
                <RiArrowRightLine className="ml-auto size-4 shrink-0 text-text-link" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
