import { initials, PartyAvatar } from "@mt/ui/components/avatar";
import { cx } from "@mt/ui/lib/cx";
import type { CSSProperties } from "react";
import type { PartyRef } from "../types.ts";

/**
 * The mark of a force: the party's official logo when the main site has one; for a front, the marks of the parties
 * that form it, overlapped in the order of its name; else a dot with the color the force has on this page.
 */
export function PartyMark({ parties, style, size = "sm" }: { parties: PartyRef[] | undefined; style: CSSProperties; size?: "sm" | "lg" }) {
  const box = size === "lg" ? "size-12" : "size-5";
  if (parties && parties.length > 1)
    return (
      <span className={cx("flex shrink-0", size === "lg" ? "-space-x-3" : "-space-x-1.5")} aria-hidden>
        {parties.map((p) => (
          <PartyAvatar
            key={p.slug}
            party={{ name: p.nombre, short: p.sigla ?? initials(p.nombre), logo: p.logo, color: p.color }}
            className={cx(box, "ring-2 ring-background-surface")}
          />
        ))}
      </span>
    );
  const logo = parties?.[0]?.logo;
  if (logo)
    return (
      <img
        src={logo}
        alt=""
        loading="lazy"
        className={cx("shrink-0 rounded-full bg-white object-contain ring-1 ring-border-button-default", box)}
      />
    );
  return <span className={cx("shrink-0 rounded-full", size === "lg" ? "size-12" : "size-2.5")} style={style} aria-hidden />;
}
