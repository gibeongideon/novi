import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge class names; later Tailwind classes win. The only class helper in NOVI (DRY). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
