import type { ReactNode } from "react";

import { Button, type ButtonProps } from "./button.tsx";

/**
 * Button that is only an icon: always square, 44 × 44 px, secondary style (border + grey fill) so it reads as a
 * button before hover, and a required accessible name. Use it for close, menu, search and any icon-only action.
 */
export function IconButton({
  label,
  children,
  variant = "secondary",
  ...props
}: Omit<ButtonProps, "size" | "children"> & { label: string; children: ReactNode }) {
  return (
    <Button size="icon" variant={variant} aria-label={label} title={label} {...props}>
      {children}
    </Button>
  );
}
