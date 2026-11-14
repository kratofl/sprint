import type { ComponentType } from 'react'
import type { AppView } from '../bridge'

/** A window a mockup can stand in for, instead of a page in the app shell. */
export type MockupWindow = 'pitwall' | 'designer' | 'hud'

/**
 * A design mockup: `src/mockups/<name>.tsx` (gitignored) default-exports one. Always three
 * options, A, B and C, each drawn with the app's own components, primitives and tokens and shown
 * where it will live: a page inside the real app shell (`view`), or one of the app's own windows
 * (`window`). Only the preview build mounts them (`?mockup=<name>&variant=A`, scripts/preview/mockup.mjs).
 */
export type Mockup = {
  variants: { A: ComponentType; B: ComponentType; C: ComponentType }
} & ({ view: AppView } | { window: MockupWindow })

export type MockupVariant = keyof Mockup['variants']

export function isMockupVariant(value: string | null): value is MockupVariant {
  return value === 'A' || value === 'B' || value === 'C'
}
