import type { StatusTone } from './Status'

/** One screen device as the status bar counts it: connected or not, and the word and tone of its state. */
export type CountedDevice = { name: string; connected: boolean; status: { label: string; tone: StatusTone } }

export type DeviceSummary = {
  /** The tone of the state that needs the most attention; success while every device is connected. */
  tone: StatusTone
  /** "2 connected", then one count per other state in first-seen order: "1 not found". */
  parts: string[]
  /** Every device by name with its state, for the tooltip. */
  detail: string
}

// Most attention first: an error before a warning before a device that is simply not there.
const URGENCY: readonly StatusTone[] = ['danger', 'warning', 'neutral', 'info', 'brand', 'success']

/** A state's word inside a sentence: "Not found" → "not found", but "USB busy" stays. */
const inSentence = (label: string): string => (/^[A-Z][a-z]/.test(label) ? label[0].toLowerCase() + label.slice(1) : label)

/**
 * The status bar's one item for every screen device, however many there are: how many are
 * connected and how many are in each other state. Null without devices.
 */
export function summarizeDevices(devices: readonly CountedDevice[]): DeviceSummary | null {
  if (devices.length === 0) return null
  const connected = devices.filter((device) => device.connected).length
  const others = new Map<string, number>()
  let tone: StatusTone = 'success'
  for (const device of devices) {
    if (device.connected) continue
    others.set(device.status.label, (others.get(device.status.label) ?? 0) + 1)
    if (URGENCY.indexOf(device.status.tone) < URGENCY.indexOf(tone)) tone = device.status.tone
  }
  const parts = [...(connected > 0 ? [`${connected} connected`] : []), ...[...others].map(([label, count]) => `${count} ${inSentence(label)}`)]
  const detail = devices.map((device) => `${device.name}: ${device.status.label}`).join('\n')
  return { tone, parts, detail }
}
