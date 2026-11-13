import type { ComponentType } from 'react'

/**
 * A design mockup: `web/mockups/<name>.tsx` (gitignored) default-exports one. Always three
 * options, A, B and C, built from the app's own components (`components/ui`, `components/app`) on
 * the `web.css` tokens and shown where they will live: inside the real app shell, with `page` the
 * sidebar entry it belongs to (`'/setups'`), or `bare` for a page with its own look (sign-in).
 * The options are server components; one that needs state renders a client component. Only
 * `next dev` serves them, at /mockups/<name>?variant=A (scripts/mockup.mjs).
 */
export type Mockup = {
  variants: { A: ComponentType; B: ComponentType; C: ComponentType }
} & ({ page: string } | { bare: true })

export type MockupVariant = keyof Mockup['variants']

export function isMockupVariant(value: unknown): value is MockupVariant {
  return value === 'A' || value === 'B' || value === 'C'
}
