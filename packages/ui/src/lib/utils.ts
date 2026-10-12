import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names and resolves Tailwind conflicts (the last one wins): `cn("px-2", cond && "px-4")`. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
