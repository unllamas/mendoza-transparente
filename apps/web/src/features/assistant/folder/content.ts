import type { Block, Level } from "@mt/assistant/types";
import { formatDate } from "@/lib.ts";

export type StepsBlock = Extract<Block, { type: "steps" }>;

export interface FolderStep {
  number: number;
  title: string;
  agency: string;
  detail: string;
  href: string;
  verified: string;
}

export interface FolderGroup {
  heading: string;
  steps: FolderStep[];
}

/** What the PDF says, before drawing it: sections of text, so it can be tested without making a file. */
export interface FolderContent {
  title: string;
  subtitle: string;
  /** "Bajada el 27 octubre 2026" */
  downloaded: string;
  groups: FolderGroup[];
  /** Empty boxes to tick off. */
  checklist: string[];
  /** Whole sentences: "ATM no publica cuánto tarda…". */
  unpublished: string[];
  footer: string[];
  siteUrl: string;
}

const LEVEL_ORDER: Level[] = ["nacion", "provincia", "municipio"];

const levelHeading = (level: Level, municipality: string) =>
  level === "nacion" ? "Nación" : level === "provincia" ? "Provincia de Mendoza" : `Municipalidad de ${municipality}`;

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
const withoutDot = (text: string) => text.trim().replace(/[.\s]+$/, "");

/** The papers to tick off: the ones the block lists, or, while it lists none, one box per step. */
function checklistOf(block: StepsBlock): string[] {
  if (block.papers?.length) return block.papers;
  return block.steps.map((s) => `${s.title} (${s.agency})`);
}

export function buildFolderContent(block: StepsBlock, siteUrl: string, today: string): FolderContent {
  const title = block.title ?? "Trámite";
  const groups: FolderGroup[] = [];
  for (const level of LEVEL_ORDER) {
    const steps: FolderStep[] = block.steps
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.level === level)
      .map(({ s, i }) => ({
        number: i + 1,
        title: s.title,
        agency: s.agency,
        detail: s.detail,
        href: s.href,
        verified: formatDate(s.verified ?? block.verified),
      }));
    if (steps.length) groups.push({ heading: levelHeading(level, block.municipality), steps });
  }
  return {
    title,
    subtitle: [block.activity, block.municipality].filter(Boolean).join(" · "),
    downloaded: `Bajada el ${formatDate(today)}`,
    groups,
    checklist: checklistOf(block),
    unpublished: (block.unpublished ?? []).map(
      (u) => `${u.agency} no publica ${lowerFirst(withoutDot(u.what))}.${u.detail ? ` ${withoutDot(u.detail)}.` : ""}`,
    ),
    footer: [
      "Esta carpeta es una guía de Mendoza Transparente, hecha con datos oficiales. Puede tener errores o estar desactualizada.",
      "Confirmá cada paso en la ventanilla o en el sitio oficial antes de hacerlo. Mendoza Transparente no es un organismo del Estado.",
    ],
    siteUrl,
  };
}
