import { Car, ChevronDown, ChevronRight, Gamepad2, Monitor, Tags, type LucideIcon } from 'lucide-react'
import type { DashLayout } from '@sprint/dashboard'
import { gameName } from '../views/AnalysisBrowseDomain'
import { DASH_RULE_CLASSES, type Device, type DeviceDashRule } from '../views/DevicesDomain'
import { carClassOf, isPointable, placeName, placesOf, scopeName, shownDash, type DashScope } from './dashScope'
import { dropVariant, isDashItself, ownVariant, shownVariant } from './variants'

/** A picker in the strip: its icon, a native select (keyboard and screen readers get it for free), a chevron. */
function Pick({ icon: Icon, label, value, options, onChange }: {
  icon?: LucideIcon
  label: string
  value: string
  options: ReadonlyArray<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <label className="designer-scope-pick">
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
 * The designer's title bar: Device › Game › Class › Car, which version of the dash the sections
 * edit (variants.ts). The window is the dash, so there is no dash picker. Nothing picked is the
 * dash itself. A scope with a version of its own says so and can drop it (`onDropVariant`); one
 * without says what it shows instead ("Same as …"), and the first edit there makes its own. Where
 * the wheel shows another dash in that scope (the device's dash rules), "Use here" makes it show
 * this one (`onPoint`).
 */
export function ScopeStrip({
  scope,
  dash,
  layouts,
  devices,
  allDevices,
  games,
  cars,
  onScope,
  onPoint,
  onDropVariant,
}: {
  scope: DashScope
  /** The dash this window edits, with its variants. */
  dash: DashLayout
  layouts: readonly DashLayout[]
  /** The screens a dash can show on. */
  devices: readonly Device[]
  /** The rules for every device. */
  allDevices: readonly DeviceDashRule[]
  /** The games and cars Sprint has recorded (the planner's `planContext`). */
  games: readonly string[]
  cars: readonly string[]
  onScope: (scope: DashScope) => void
  onPoint: () => void
  onDropVariant: () => void
}) {
  const exists = (id: string): boolean => layouts.some((layout) => layout.id === id)
  const onWheel = shownDash(scope, devices, allDevices, exists)
  const own = ownVariant(dash, scope)
  // What the scope shows without a version of its own: a broader scope's version, else the dash itself.
  const inherited = shownVariant(own ? dropVariant(dash, scope) : dash, scope)
  const unique = (values: readonly string[]): string[] => [...new Map(values.filter((value) => value.trim() !== '').map((value) => [value.toLowerCase(), value])).values()]
  const ruleValues = (kind: DeviceDashRule['kind']): string[] => [...devices.flatMap((device) => device.dashRules), ...allDevices].filter((rule) => rule.kind === kind).map((rule) => rule.value)
  const gameOptions = unique([...games, ...ruleValues('game'), ...(scope.game ? [scope.game] : [])])
  const carOptions = unique([...cars, ...ruleValues('car'), ...(scope.car ? [scope.car] : [])])
    .filter((car) => scope.carClass === null || carClassOf(car) === scope.carClass)
    .sort((a, b) => a.localeCompare(b))

  const deviceOptions = [{ value: ALL, label: 'All devices' }, ...devices.map((device) => ({ value: device.id, label: device.name }))]
  // The wheel shows another dash in this scope (its device's dash rules): "Use here" points the scope at this one.
  const elsewhere = isPointable(scope) && onWheel !== null && onWheel.dashId !== dash.id
  const inheritedName = inherited
    ? scopeName({ device: inherited.scope.device ?? null, game: inherited.scope.game ?? null, carClass: inherited.scope.carClass ?? null, car: inherited.scope.car ?? null }, devices)
    : dash.name

  return (
    <div className="designer-scope" role="group" aria-label="Where this dash is used">
      <Pick icon={Monitor} label="Device" value={scope.device ?? ALL} options={deviceOptions} onChange={(value) => onScope({ ...scope, device: value === ALL ? null : value })} />
      <ChevronRight size={14} className="designer-scope-sep" aria-hidden="true" />
      <Pick
        icon={Gamepad2}
        label="Game"
        value={scope.game ?? ALL}
        options={[{ value: ALL, label: 'All games' }, ...gameOptions.map((game) => ({ value: game, label: gameName(game) }))]}
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
          // A car always names its class (the wheel reads the class from the car), so a class it is not in, or none, lets it go.
          const car = scope.car !== null && (carClass === null || carClassOf(scope.car) !== carClass) ? null : scope.car
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
      {!isDashItself(scope) &&
        (own ? (
          <span className="designer-scope-note">
            <span className="muted">Own version</span>
            <button type="button" className="button small subtle" title={`Drop this version: the scope shows the same as ${inheritedName} again`} onClick={onDropVariant}>
              Remove
            </button>
          </span>
        ) : (
          <span className="designer-scope-note muted" title="Your first change here makes a version of its own; the rest keeps showing the same.">
            {`Same as ${inheritedName}`}
          </span>
        ))}
      {elsewhere && (
        <button type="button" className="button small subtle" title={`The wheel shows ${layouts.find((layout) => layout.id === onWheel.dashId)?.name ?? 'another dash'} here; show this one`} onClick={onPoint}>
          Use here
        </button>
      )}
    </div>
  )
}

/** The status bar's account of where this dash shows: "Used in 2 places", every place on hover. */
export function UsedIn({ dashId, devices, allDevices }: { dashId: string; devices: readonly Device[]; allDevices: readonly DeviceDashRule[] }) {
  const places = placesOf(dashId, devices, allDevices)
  const text = places.length === 0 ? 'Not used yet' : places.length === 1 ? 'Used in 1 place' : `Used in ${places.length} places`
  return (
    <span className="statusbar-item designer-scope-used" tabIndex={places.length > 0 ? 0 : -1} title={places.map((place) => placeName(place, devices)).join('\n')}>
      {text}
    </span>
  )
}
