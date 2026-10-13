import { TemplateCopyProvider } from "@mt/ui/components/foundations/template-copy/template-copy";
import { useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RouterProvider } from "react-aria-components";

/** Spanish for the few labels BoardUI components ship in English (the rest receive their copy as props). */
const COPY: Record<string, string> = {
  Theme: "Tema",
  "Use light mode": "Usar modo claro",
  "Use dark mode": "Usar modo oscuro",
  "Light mode": "Modo claro",
  "Dark mode": "Modo oscuro",
};

const translate = (text: string) => COPY[text] ?? text;

/**
 * Wires @mt/ui (BoardUI, React Aria) to the site: links inside its components navigate with TanStack Router
 * instead of reloading the page, and its built-in labels read in Spanish.
 */
export function UiProviders({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    <RouterProvider navigate={(href) => router.navigate({ href })}>
      <TemplateCopyProvider translate={translate}>{children}</TemplateCopyProvider>
    </RouterProvider>
  );
}
