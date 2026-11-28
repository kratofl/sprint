import type { SprintCommand } from '../bridge'
import { gameName } from '../views/AnalysisBrowseDomain'
import { DASH_RULE_CLASSES, buildDashRules, buildDeviceUpdate, type DashRuleKind, type Device, type DeviceDashRule } from '../views/DevicesDomain'

/**
 * The designer's scope, in its title bar: Device › Game › Class › Car. A scope points to a dash, and
 * editing that dash changes it everywhere it is used. The scope's deepest pick is the rule it
 * stands for (a car's, a class's or a game's); with none, a device's own dash. "All devices" is
 * the app-wide rule list (`dash.allDevicesRules`); it needs at least a game. What a scope shows
 * follows the host's `DeviceDashRules.Pick`: a car before its class before its game, and at the
 * same level a device's own rule before one for every device.
 */

/** `device` null is "All devices"; a null level is "All games/classes/cars". */
export type DashScope = { device: string | null; game: string | null; carClass: string | null; car: string | null }

/** Where a dash is used: on one device (or every one) for every car, or for a game, class or car. */
export type DashPlace = { device: string | null; rule: { kind: DashRuleKind; value: string } | null }

/** The class a car's name starts with ("Hypercar BMW" → Hypercar; host `CarNames.ClassOf`), or null. */
export function carClassOf(car: string): string | null {
  const first = car.trim().split(' ')[0]?.toLowerCase() ?? ''
  return DASH_RULE_CLASSES.find((name) => name.toLowerCase() === first) ?? null
}

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

/** The rule a scope stands for (its deepest pick); null for a device's own dash. */
export function scopeRule(scope: DashScope): { kind: DashRuleKind; value: string } | null {
  if (scope.car) return { kind: 'car', value: scope.car }
  if (scope.carClass) return { kind: 'class', value: scope.carClass }
  if (scope.game) return { kind: 'game', value: scope.game }
  return null
}

/** Whether the scope can point to a dash: every device's own dash is theirs, so "All devices" needs a game, class or car. */
export const isPointable = (scope: DashScope): boolean => scope.device !== null || scopeRule(scope) !== null

const rulesAt = (scope: DashScope, devices: readonly Device[], allDevices: readonly DeviceDashRule[]): readonly DeviceDashRule[] =>
  scope.device === null ? allDevices : (devices.find((device) => device.id === scope.device)?.dashRules ?? [])

/** The dash the scope points to itself, or null when it has no rule of its own (it shows a broader scope's). */
export function ownDash(scope: DashScope, devices: readonly Device[], allDevices: readonly DeviceDashRule[]): string | null {
  const rule = scopeRule(scope)
  if (rule === null) return scope.device === null ? null : (devices.find((device) => device.id === scope.device)?.dashId ?? null)
  return rulesAt(scope, devices, allDevices).find((candidate) => candidate.kind === rule.kind && same(candidate.value, rule.value))?.dashId ?? null
}

/**
 * The dash the wheel shows at the scope, and the place it comes from: its own rule, else the most
 * specific broader one (a device's own beating every device's at the same level), else the
 * device's own dash. Null on "All devices" when no rule for every device covers it.
 */
export function shownDash(scope: DashScope, devices: readonly Device[], allDevices: readonly DeviceDashRule[], exists: (dashId: string) => boolean): { dashId: string; from: DashPlace } | null {
  const carClass = scope.carClass ?? (scope.car ? carClassOf(scope.car) : null)
  const level = (rule: DeviceDashRule): number => {
    if (rule.kind === 'car') return scope.car !== null && same(rule.value, scope.car) ? 3 : 0
    if (rule.kind === 'class') return carClass !== null && same(rule.value, carClass) ? 2 : 0
    return scope.game !== null && same(rule.value, scope.game) ? 1 : 0
  }
  const device = scope.device === null ? undefined : devices.find((candidate) => candidate.id === scope.device)
  const candidates = [...(device?.dashRules ?? []).map((rule) => ({ rule, device: device?.id ?? null, own: 1 })), ...allDevices.map((rule) => ({ rule, device: null, own: 0 }))]
  let best: { dashId: string; from: DashPlace; rank: number } | null = null
  for (const candidate of candidates) {
    const at = level(candidate.rule)
    const rank = at === 0 ? 0 : at * 2 + candidate.own
    if (rank > (best?.rank ?? 0) && exists(candidate.rule.dashId)) {
      best = { dashId: candidate.rule.dashId, from: { device: candidate.device, rule: { kind: candidate.rule.kind, value: candidate.rule.value } }, rank }
    }
  }
  if (best) return { dashId: best.dashId, from: best.from }
  if (device && exists(device.dashId)) return { dashId: device.dashId, from: { device: device.id, rule: null } }
  return null
}

/** Every place `dashId` is used: devices' own dashes, then their rules, then the rules for every device. */
export function placesOf(dashId: string, devices: readonly Device[], allDevices: readonly DeviceDashRule[]): DashPlace[] {
  return [
    ...devices.filter((device) => device.dashId === dashId).map((device): DashPlace => ({ device: device.id, rule: null })),
    ...devices.flatMap((device) => device.dashRules.filter((rule) => rule.dashId === dashId).map((rule): DashPlace => ({ device: device.id, rule: { kind: rule.kind, value: rule.value } }))),
    ...allDevices.filter((rule) => rule.dashId === dashId).map((rule): DashPlace => ({ device: null, rule: { kind: rule.kind, value: rule.value } })),
  ]
}

/** The scope a place stands for: a car's scope carries its class, so the strip shows where it sits. */
export function scopeOf(place: DashPlace): DashScope {
  const rule = place.rule
  if (rule === null) return { device: place.device, game: null, carClass: null, car: null }
  if (rule.kind === 'game') return { device: place.device, game: rule.value, carClass: null, car: null }
  if (rule.kind === 'class') return { device: place.device, game: null, carClass: rule.value, car: null }
  return { device: place.device, game: null, carClass: carClassOf(rule.value), car: rule.value }
}

/** A place as one line: "Omega PRO V2 · every car", "All devices › Hypercar". */
export function placeName(place: DashPlace, devices: readonly Device[]): string {
  const device = place.device === null ? 'All devices' : (devices.find((candidate) => candidate.id === place.device)?.name ?? 'A removed device')
  if (place.rule === null) return `${device} · every car`
  return `${device} › ${place.rule.kind === 'game' ? gameName(place.rule.value) : place.rule.value}`
}

/** The scope's deepest pick, as "Use here" and the name of a scope's own copy say it. */
export function scopeName(scope: DashScope, devices: readonly Device[]): string {
  const rule = scopeRule(scope)
  if (rule) return rule.kind === 'game' ? gameName(rule.value) : rule.value
  return scope.device === null ? 'All devices' : (devices.find((device) => device.id === scope.device)?.name ?? 'this device')
}

/** The command pointing the scope at `dashId`: a device's own dash, or its (or every device's) rule added or changed. Null when the scope cannot point. */
export function pointScope(scope: DashScope, dashId: string, devices: readonly Device[], allDevices: readonly DeviceDashRule[]): SprintCommand | null {
  const rule = scopeRule(scope)
  const upsert = (rules: readonly DeviceDashRule[], kind: DashRuleKind, value: string): DeviceDashRule[] =>
    rules.some((candidate) => candidate.kind === kind && same(candidate.value, value))
      ? rules.map((candidate) => (candidate.kind === kind && same(candidate.value, value) ? { ...candidate, dashId } : candidate))
      : [...rules, { kind, value, dashId }]
  if (scope.device === null) {
    if (rule === null) return null
    return { type: 'dash.allDevicesRules', rules: upsert(allDevices, rule.kind, rule.value).map(({ kind, value, dashId: id }) => ({ kind, value, dashId: id })) }
  }
  const device = devices.find((candidate) => candidate.id === scope.device)
  if (!device) return null
  return rule === null ? buildDeviceUpdate(device, { dashId }) : buildDashRules(device, upsert(device.dashRules, rule.kind, rule.value))
}
