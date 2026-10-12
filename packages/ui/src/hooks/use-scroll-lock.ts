import { useEffect } from "react";

let locks = 0;

/**
 * While `active`, the page behind does not scroll (mobile menu, modal sheets): there is a single scroll, the
 * panel's. Locks both <html> and <body> because with `overflow-x: clip` on html it is <html> that scrolls.
 * Counts locks in case more than one panel is open.
 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (locks++ === 0) {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    }
    return () => {
      if (--locks === 0) {
        document.documentElement.style.overflow = "";
        document.body.style.overflow = "";
      }
    };
  }, [active]);
}
