import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function formatScore(n: number): string {
  return n.toFixed(2);
}
