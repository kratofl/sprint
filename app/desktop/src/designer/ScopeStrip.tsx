import type { ReactNode } from 'react'
import { ArrowRight, Car, ChevronDown, ChevronRight, Copy, Gamepad2, Monitor, Tags, type LucideIcon } from 'lucide-react'
import type { DashLayout } from '@sprint/dashboard'
import { gameName } from '../views/AnalysisBrowseDomain'
import { DASH_RULE_CLASSES, type Device, type DeviceDashRule } from '../views/DevicesDomain'
import { carClassOf, isPointable, ownDash, placeName, placesOf, scopeName, shownDash, type DashScope } from './dashScope'

/** A picker in the strip: its icon, a native select (keyboard and screen readers get it for free), a chevron. */
function Pick({ icon: Icon, label, value, options, onChange, strong = false }: {
  icon?: LucideIcon
  label: string
  value: string
  options: ReadonlyArray<{ value: string; label: string }>
  onChange: (value: string) => void
  strong?: boolean
}) {
  return (
    <label className={`designer-scope-pick${strong ? ' is-dash' : ''}`}>
      {Icon && <Icon size={15} aria-hidden="true" />}
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} aria-hidden="true" />
    </label>
  )
}

const ALL = ''

/**
 * Top of the designer: Device › Game › Class › Car → Dash. The pickers are where you look: a
 * scope opens the dash it uses (`onOpen`). The dash picker points the scope at another dash
 * (`onPoint`); "Use here" does that for this window's dash. "Used in N places" names every place
 * this dash shows (hover); "Own copy" gives the scope a copy of its own to change apart. `status` is the save state at the end.
 */
export function ScopeStrip({
  scope,
  dashId,
  layouts,
  devices,
  allDevices,
  games,
  cars,
  onScope,
  onPoint,
  onOwnCopy,
  status,
}: {
  scope: DashScope
  /** The dash this window edits. */
  dashId: string
  layouts: readonly DashLayout[]
  /** The screens a dash can show on. */
  devices: readonly Device[]
  /** The rules for every device. */
  allDevices: readonly DeviceDashRule[]
  /** The games and cars Sprint has recorded (the planner's `planContext`). */
  games: readonly string[]
  cars: readonly string[]
  onScope: (scope: DashScope) => void
  onPoint: (dashId: string) => void
  onOwnCopy: () => void
  status: ReactNode
}) {
  const exists = (id: string): boolean => layouts.some((layout) => layout.id === id)
  const shown = shownDash(scope, devices, allDevices, exists)
  const own = ownDash(scope, devices, allDevices)
  const places = placesOf(dashId, devices, allDevices)
  const unique = (values: readonly string[]): string[] => [...new Map(values.filter((value) => value.trim() !== '').map((value) => [value.toLowerCase(), value])).values()]
  const ruleValues = (kind: DeviceDashRule['kind']): string[] => [...devices.flatMap((device) => device.dashRules), ...allDevices].filter((rule) => rule.kind === kind).map((rule) => rule.value)
  const gameOptions = unique([...games, ...ruleValues('game'), ...(scope.game ? [scope.game] : [])])
  const carOptions = unique([...cars, ...ruleValues('car'), ...(scope.car ? [scope.car] : [])])
    .filter((car) => scope.carClass === null || carClassOf(car) === scope.carClass)
    .sort((a, b) => a.localeCompare(b))

  // "All devices" stands for every device's own dash only through a game, class or car: picking it lands on the first game.
  const pickDevice = (value: string): void => {
    const device = value === ALL ? null : value
    const next = { ...scope, device }
    onScope(device === null && !isPointable(next) ? { ...next, game: gameOptions[0] ?? 'LeMansUltimate' } : next)
  }

  const deviceOptions = [...devices.map((device) => ({ value: device.id, label: device.name })), { value: ALL, label: 'All devices' }]
  const usedText = places.length === 0 ? 'Not used yet' : places.length === 1 ? 'Used in 1 place' : `Used in ${places.length} places`
  // This window's dash is not what the scope shows (it was opened from the Dashes page): the dash picker can point the scope at it.
  const elsewhere = shown?.dashId !== dashId

  return (
    <div className="designer-glass designer-scope" role="group" aria-label="Where this dash is used">
      <Pick icon={Monitor} label="Device" value={scope.device ?? ALL} options={deviceOptions} onChange={pickDevice} />
      <ChevronRight size={14} className="designer-scope-sep" aria-hidden="true" />
      <Pick
        icon={Gamepad2}
        label="Game"
        value={scope.game ?? ALL}
        options={[...(scope.device === null ? [] : [{ value: ALL, label: 'All games' }]), ...gameOptions.map((game) => ({ value: game, label: gameName(game) }))]}
        onChange={(value) => onScope({ ...scope, game: value === ALL ? null : value })}
      />
      <ChevronRight size={14} className="designer-scope-sep" aria-hidden="true" />
      <Pick
        icon={Tags}
        label="Class"
        value={scope.carClass ?? ALL}
        options={[{ value: ALL, label: 'All classes' }, ...DASH_RULE_CLASSES.map((name) => ({ value: name, label: name }))]}
        onChange={(value) => {
          const carClass = value === ALL ? null : value
          const car = scope.car !== null && carClass !== null && carClassOf(scope.car) !== carClass ? null : scope.car
          onScope({ ...scope, carClass, car })
        }}
      />
      <ChevronRight size={14} className="designer-scope-sep" aria-hidden="true" />
      <Pick
        icon={Car}
        label="Car"
        value={scope.car ?? ALL}
        options={[{ value: ALL, label: 'All cars' }, ...carOptions.map((car) => ({ value: car, label: car }))]}
        onChange={(value) => onScope({ ...scope, car: value === ALL ? null : value, carClass: value === ALL ? scope.carClass : (carClassOf(value) ?? scope.carClass) })}
      />
      <ArrowRight size={15} className="designer-scope-uses" aria-label="uses" />
      <Pick
        label="Dash"
        strong
        value={dashId}
        options={layouts.map((layout) => ({ value: layout.id, label: layout.name || 'Untitled dash' }))}
        onChange={(id) => {
          if (isPointable(scope)) onPoint(id)
        }}
      />
      {elsewhere ? (
        <span className="designer-scope-note">
          {isPointable(scope) ? (
            <button type="button" className="button subtle" title={`Show this dash for ${scopeName(scope, devices)}`} onClick={() => onPoint(dashId)}>
              Use here
            </button>
          ) : (
            'Each device shows its own'
          )}
        </span>
      ) : (
        own === null &&
        shown && <span className="designer-scope-note muted">{`Same as ${placeName(shown.from, devices)}`}</span>
      )}
      <span className="designer-scope-rule" aria-hidden="true" />
      <span className="designer-scope-used" tabIndex={places.length > 0 ? 0 : -1} title={places.map((place) => placeName(place, devices)).join('\n')}>
        {usedText}
      </span>
      <button
        type="button"
        className="button subtle"
        title={`Give ${scopeName(scope, devices)} a copy of this dash to change on its own`}
        disabled={!isPointable(scope) || elsewhere}
        onClick={onOwnCopy}
      >
        <Copy size={14} aria-hidden="true" /> Own copy
      </button>
      {status}
    </div>
  )
}
