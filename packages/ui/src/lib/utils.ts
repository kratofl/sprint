import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge Tailwind class names, resolving conflicts correctly (e.g. bg-red overrides bg-accent). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
