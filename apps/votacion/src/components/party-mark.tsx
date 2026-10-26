import { cx } from "@mt/ui/lib/cx";
import type { CSSProperties } from "react";
import type { PartyRef } from "../types.ts";

/** The party's official logo when the main site has one; else a dot with the color the force has on this page. */
export function PartyMark({ party, style, size = "sm" }: { party: PartyRef | undefined; style: CSSProperties; size?: "sm" | "lg" }) {
  if (party?.logo)
    return (
      <img
        src={party.logo}
        alt=""
        loading="lazy"
        className={cx(
          "shrink-0 rounded-full bg-white object-contain ring-1 ring-border-button-default",
          size === "lg" ? "size-12" : "size-5",
        )}
      />
    );
  return <span className={cx("shrink-0 rounded-full", size === "lg" ? "size-12" : "size-2.5")} style={style} aria-hidden />;
}
