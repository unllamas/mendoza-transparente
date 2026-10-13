import { Sheet } from "@mt/ui/components/sheet";
import { type ReactNode, useEffect } from "react";

import { track } from "../analytics.ts";

/** Sheet with analytics: every sheet sends `sheet.open` and `sheet.close` (with the seconds it was open). */
export function TrackedSheet({
  title,
  onClose,
  children,
  trackId,
  header,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Analytics id of this sheet ("missing_data.request"); the title when absent. */
  trackId?: string;
  header?: ReactNode;
}) {
  useEffect(() => {
    const opened = Date.now();
    track("sheet.open", { sheet: trackId ?? title });
    return () => track("sheet.close", { sheet: trackId ?? title, seconds: Math.round((Date.now() - opened) / 1000) });
  }, [trackId, title]);
  return (
    <Sheet title={title} onClose={onClose} header={header} closeProps={{ "data-track": "sheet.close_button" }}>
      {children}
    </Sheet>
  );
}
