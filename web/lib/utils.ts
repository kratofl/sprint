import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// The design system's type styles (app/globals.css) are font sizes, so tailwind-merge
// must not mistake `text-callout` for a colour and drop it next to `text-label`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['display', 'large-title', 'kpi', 'title-1', 'title-2', 'title-3', 'headline', 'body', 'callout', 'footnote', 'caption'],
    },
  },
})

// Joins class names; later Tailwind classes win over earlier ones of the same kind.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
