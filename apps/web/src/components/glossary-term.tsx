import { Popover, PopoverContent, PopoverTrigger } from "@mt/ui/components/popover";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { GLOSSARY } from "@/glossary.ts";

/**
 * A hard word explained where it is used: dotted underline, and its glossary definition in a popover that opens on tap
 * (there is no hover on a phone). Only for the terms a page depends on, not for every word: see
 * docs/procesos/diseno.md, "Términos difíciles".
 */
export function Term({ id, children }: { id: string; children: ReactNode }) {
  const entry = GLOSSARY.find((g) => g.id === id);
  if (!entry) return <>{children}</>;
  return (
    <Popover>
      <PopoverTrigger
        data-track="glossary.term.open"
        data-track-term={id}
        className="inline cursor-help rounded-sm text-inherit underline decoration-text-tertiary decoration-dotted underline-offset-4 hover:decoration-text-link aria-expanded:decoration-text-link"
      >
        {children}
      </PopoverTrigger>
      <PopoverContent>
        <p className="font-medium text-text-primary">{entry.term}</p>
        <p className="mt-1">{entry.definition}</p>
        <Link to="/como-leer" hash={entry.id} className="mt-2 inline-block text-text-link underline">
          Ver en el glosario
        </Link>
      </PopoverContent>
    </Popover>
  );
}
