import type { RadioDelivery } from '../bridge'
import type { StatusTone } from '../shell/Status'
import { KIND_LABEL, type PitWallLayout } from './pitWallData'
import { lapClock } from './timing'

// The Radio and Windows tiles' sums: what the engineer can call, how a message is doing, the target
// lap stepper and what can go into a window of its own. Pure; the tiles only render it.

/** The calls the Radio tile offers with one press. The host takes any one-line text up to 48 characters. */
export const RADIO_CALLS = ['Box this lap', 'Box now', 'Stay out', 'Push', 'Save fuel', 'Lift and coast', 'Traffic behind', 'Yellow ahead'] as const

/** The host's limits (RadioRules). */
export const MAX_RADIO_TEXT = 48
const MIN_TARGET = 20
const MAX_TARGET = 3600

/** A message's state in a word, never colour alone. */
export const deliveryStatus = (delivery: RadioDelivery): { tone: StatusTone; label: string } => {
  switch (delivery) {
    case 'Sending':
      return { tone: 'neutral', label: 'Sending…' }
    case 'OnWheel':
      return { tone: 'info', label: 'On the wheel' }
    case 'Seen':
      return { tone: 'success', label: 'Seen' }
    case 'Unanswered':
      return { tone: 'warning', label: 'Not acknowledged' }
  }
}

/** The target lap message as the wheel shows it: "Target lap 2:04.5". */
export const targetText = (seconds: number): string => `Target lap ${lapClock(seconds)}`

/** The stepper's next value: a tenth at a time, kept to what the host takes. */
export const stepTarget = (seconds: number, tenths: number): number =>
  Math.min(MAX_TARGET, Math.max(MIN_TARGET, Math.round(seconds * 10 + tenths) / 10))

/** "14:02" from the host's timestamp, on this PC's clock; empty when it does not read. */
export const sentClock = (iso: string): string => {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? '' : `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}

/** A page or a tile that can have a window of its own. */
export type WindowTarget = { kind: 'page' | 'tile'; id: string; name: string }

const tileName = (layers: readonly (keyof typeof KIND_LABEL)[]): string => layers.map((kind) => KIND_LABEL[kind]).join(' · ')

/** What is in a window of its own now, pages first. */
export const ownWindows = (layout: PitWallLayout): WindowTarget[] => [
  ...layout.pages.filter((page) => page.detached).map((page) => ({ kind: 'page' as const, id: page.id, name: page.name })),
  ...layout.pages.flatMap((page) =>
    page.tiles.filter((tile) => tile.detached).map((tile) => ({ kind: 'tile' as const, id: tile.id, name: `${tileName(tile.layers)} · ${page.name}` })),
  ),
]

/** What New window offers: every page still on the wall, and every tile still on its page. */
export const openable = (layout: PitWallLayout): { pages: WindowTarget[]; tiles: WindowTarget[] } => ({
  pages: layout.pages.filter((page) => !page.detached).map((page) => ({ kind: 'page', id: page.id, name: page.name })),
  tiles: layout.pages.flatMap((page) =>
    page.tiles.filter((tile) => !tile.detached).map((tile) => ({ kind: 'tile' as const, id: tile.id, name: `${tileName(tile.layers)} · ${page.name}` })),
  ),
})
