import { primitiveRadius } from '../primitive'

/** Border radius scale — soft but never pill-like by default. */
export const borderRadius = {
  nested:  primitiveRadius.nested,
  control: primitiveRadius.control,
  group:   primitiveRadius.group,
  overlay: primitiveRadius.overlay,
  xs:      primitiveRadius.xs,
  sm:      primitiveRadius.sm,
  tag:     primitiveRadius.badge,
  icon:    primitiveRadius.icon,
  badge:   primitiveRadius.badge,
  card:    primitiveRadius.card,
  panel:   primitiveRadius.panel,
  alert:   primitiveRadius.alert,
  tile:    primitiveRadius.tile,
  DEFAULT: primitiveRadius.control,
  md:      primitiveRadius.control,
  lg:      primitiveRadius.card,
  xl:      primitiveRadius.panel,
  '2xl':   primitiveRadius.panel,
  pill:    primitiveRadius.pill,
  full:    primitiveRadius.pill,
} as const
