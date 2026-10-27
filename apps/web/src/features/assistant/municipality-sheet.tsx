import { MUNICIPALITIES } from "@mt/assistant/types";
import { IconButton } from "@mt/ui/components/base/buttons/icon-button";
import { listRowVariants, listVariants } from "@mt/ui/components/card";
import { RiArrowRightSLine, RiCloseLine, RiSearchLine } from "@remixicon/react";
import { useState } from "react";
import { normalizeText } from "@/lib.ts";

/** Municipality picker: a search on top and one column, the list scrolls under it. */
export function MunicipalitySheet({ onPick, onClose }: { onPick: (municipality: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const shown = MUNICIPALITIES.filter((m) => normalizeText(m).includes(normalizeText(query)));
  return (
    <div className="absolute inset-0 z-10 flex flex-col justify-end">
      <button type="button" aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div
        role="dialog"
        aria-label="Elegí el municipio"
        className="relative flex h-[85%] flex-col gap-1 rounded-t-3xl bg-background-full shadow-2xl"
      >
        <span className="mx-auto mt-2 h-1 w-10 rounded-full bg-border-button-default" aria-hidden />
        <div className="flex h-14 shrink-0 items-center pr-3 pl-5">
          <span className="mr-auto text-headline-medium text-text-primary">¿En qué municipio?</span>
          <IconButton icon={RiCloseLine} aria-label="Cerrar" onClick={onClose} />
        </div>
        <div className="shrink-0 px-5 pb-4">
          <label className="flex h-12 items-center gap-2 rounded-2xl bg-background-surface px-4 shadow-card focus-within:ring-2 focus-within:ring-border-focus-ring">
            <RiSearchLine className="size-5 shrink-0 text-text-tertiary" aria-hidden />
            <input
              aria-label="Buscar municipio"
              placeholder="Buscar municipio"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent text-body-regular text-text-primary outline-none placeholder:text-text-tertiary max-sm:text-base"
            />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {shown.length ? (
            <ul className={listVariants()}>
              {shown.map((m) => (
                <li key={m}>
                  <button type="button" onClick={() => onPick(m)} className={listRowVariants()}>
                    <span className="min-w-0 flex-1 truncate text-body-regular text-text-primary">{m}</span>
                    <RiArrowRightSLine className="size-5 shrink-0 text-text-link" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-body-regular text-text-secondary">
              Ningún municipio se llama así. Probá con otra parte del nombre.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
