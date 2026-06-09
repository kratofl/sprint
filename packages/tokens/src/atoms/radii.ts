import { primitiveRadius } from '../primitive'

/** Border radius scale — soft but never pill-like by default. */
export const borderRadius = {
  xs:      primitiveRadius.xs,
  sm:      primitiveRadius.sm,
  tag:     primitiveRadius.badge,
  icon:    primitiveRadius.tile,
  badge:   primitiveRadius.badge,
  control: primitiveRadius.control,
  card:    primitiveRadius.panel,
  panel:   primitiveRadius.panel,
  alert:   primitiveRadius.alert,
  tile:    primitiveRadius.tile,
  DEFAULT: primitiveRadius.control,
  md:      primitiveRadius.control,
  lg:      primitiveRadius.panel,
  xl:      primitiveRadius.panel,
  '2xl':   primitiveRadius.panel,
  pill:    primitiveRadius.pill,
  full:    primitiveRadius.pill,
} as const
