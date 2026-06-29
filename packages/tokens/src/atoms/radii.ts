import { primitiveRadius } from '../primitive'

/**
 * Border radius scale — Figma flat-UI, pill-heavy.
 *
 * The Figma scale is xxs 4 · xs 6 · sm 8 · md 12 · lg 16 · xl 18 · pill 999.
 * The named semantic keys (control/panel/tile/badge/…) are kept as back-compat
 * aliases pointing at the closest Figma step so existing `rounded-*` utilities
 * keep resolving until consumers migrate.
 */
export const borderRadius = {
  // Figma primitive scale
  xxs:     primitiveRadius.xxs,   // 4px
  xs:      primitiveRadius.xs,    // 6px
  sm:      primitiveRadius.sm,    // 8px
  md:      primitiveRadius.md,    // 12px
  lg:      primitiveRadius.lg,    // 16px
  xl:      primitiveRadius.xl,    // 18px

  // Back-compat named aliases (closest Figma step)
  tag:     primitiveRadius.xxs,   // chips/badges → 4px
  badge:   primitiveRadius.xxs,   // 4px
  icon:    primitiveRadius.md,    // icon tiles → 12px
  tile:    primitiveRadius.md,    // widget tiles → 12px
  control: primitiveRadius.xl,    // buttons/inputs → 18px
  card:    primitiveRadius.xl,    // panels → 18px
  panel:   primitiveRadius.xl,    // 18px
  alert:   primitiveRadius.md,    // 12px

  DEFAULT: primitiveRadius.xl,    // 18px
  '2xl':   primitiveRadius.xl,
  pill:    primitiveRadius.pill,
  full:    primitiveRadius.pill,
} as const
