import type { ReactNode } from "react";

/**
 * The page of an entity (a supplier, an agency, a municipality). On desktop, the header and who it is go on a sticky left
 * column, so the name and its figures stay in view while the right column (charts and lists) is scrolled. One column on
 * the phone, in the same order. The left column has to fit a laptop screen (about 700 px): what does not fit goes right.
 */
export function EntityColumns({ aside, children }: { aside: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
      <div className="flex min-w-0 flex-col gap-8 lg:sticky lg:top-20">{aside}</div>
      <div className="flex min-w-0 flex-col gap-10">{children}</div>
    </div>
  );
}
