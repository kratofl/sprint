// Resolves a dash widget's binding key (e.g. "car.rpm", "lap.delta", "tires.fl") against a
// TelemetryFrame, ported from the desktop client's `Features/Dashes/DashBindingResolver.cs`.
// The switch below mirrors that file's cases one-for-one; see the inline notes for the two
// spots where the web TelemetryFrame shape (packages/types) forced a different call.

import { TirePosition, type AppSettings, type TelemetryFrame } from '@sprint/types'
import { roundToEven } from './format'

/**
 * What the driver planned to be aiming at (desktop #189) — a plan, not telemetry, which is
 * why it travels beside the frame instead of on it. Every field is `null` when unset, never
 * a number: "no fuel target planned" and "aim for 0.00 L/lap" are different claims.
 */
export interface DashTargets {
  lapTimeSeconds: number | null
  fuelPerLapLiters: number | null
}

/** Nothing planned — every `target.*` binding resolves to `null`. */
export const noDashTargets: DashTargets = { lapTimeSeconds: null, fuelPerLapLiters: null }

/** Everything a binding can be resolved against: the car, the driver, and their plan. */
export interface DashBindingContext {
  frame: TelemetryFrame
  settings?: Pick<AppSettings, 'driverName' | 'driverNumber'>
  targets?: DashTargets | null
}

/** Resolves a binding key to its current value, or `undefined` when the key is unknown. */
export function resolveBinding(context: DashBindingContext, path: string): unknown {
  const { frame } = context
  switch (path) {
    case 'session.name': return frame.session.sessionType
    case 'session.game': return frame.session.game
    case 'session.track': return frame.session.track
    case 'session.car': return frame.session.car
    case 'car.speed': return roundToEven(frame.car.speedMS * 3.6)
    case 'car.gear': return frame.car.gear
    case 'car.rpm': return roundToEven(frame.car.rpm)
    case 'car.maxRpm': return roundToEven(frame.car.maxRPM)
    case 'car.fuelLiters': return frame.car.fuel
    case 'car.fuelPerLapLiters': return frame.car.fuelPerLap
    // Discrepancy: the desktop client's Car.BrakeBiasRear is already a percentage, so its
    // resolver returns it unscaled. packages/types documents CarState.brakeBiasRear as a
    // 0-1 fraction, so it is scaled here to keep "car.brakeBiasRear" meaning a percentage.
    case 'car.brakeBiasRear': return frame.car.brakeBiasRear * 100
    case 'inputs.throttle': return frame.car.throttle
    case 'inputs.brake': return frame.car.brake
    case 'inputs.clutch': return frame.car.clutch
    case 'inputs.steering': return frame.car.steering
    case 'lap.current': return frame.lap.currentLapTime
    case 'lap.last': return frame.lap.lastLapTime
    case 'lap.best': return frame.lap.bestLapTime
    case 'lap.target': return frame.lap.targetLapTime
    case 'lap.delta': return frame.lap.delta
    case 'lap.sector': return frame.lap.sector
    // The plan's targets. Null when none was set, never zero — see DashTargets.
    case 'target.lapTime': return context.targets?.lapTimeSeconds ?? null
    case 'target.fuelPerLapLiters': return context.targets?.fuelPerLapLiters ?? null
    case 'flags.summary': return flagSummary(frame.flags)
    case 'flags.yellow': return frame.flags.yellow
    case 'flags.red': return frame.flags.red
    case 'flags.safetyCar': return frame.flags.safetyCar
    case 'electronics.tc': return Math.trunc(frame.electronics.tc)
    case 'electronics.tcActive': return frame.electronics.tcActive
    case 'electronics.abs': return Math.trunc(frame.electronics.abs)
    case 'electronics.motorMap': return Math.trunc(frame.electronics.motorMap)
    case 'energy.virtual': return frame.energy.virtualEnergy
    case 'energy.perLap': return frame.energy.virtualEnergyPerLap
    case 'energy.soc': return frame.energy.soc
    case 'energy.regen': return frame.energy.regenPower
    case 'energy.deploy': return frame.energy.deployPower
    // Discrepancy: DashBindingResolver.cs has no "race.*" cases — the desktop painter reads
    // Frame.Race directly in its own DrawPosition/DrawGaps functions instead of going through
    // the generic resolver. The web dashboard has no per-widget painter layer, and the widget
    // catalog (DashWidgetCatalog.cs) already lists these as the "position"/"gaps" bindings, so
    // they are resolved generically here.
    case 'race.position': return frame.race.position
    case 'race.totalPositions': return frame.race.totalPositions
    case 'race.gapAhead': return frame.race.gapAhead
    case 'race.gapBehind': return frame.race.gapBehind
    case 'tires.fl': return frame.tires[TirePosition.FrontLeft]
    case 'tires.fr': return frame.tires[TirePosition.FrontRight]
    case 'tires.rl': return frame.tires[TirePosition.RearLeft]
    case 'tires.rr': return frame.tires[TirePosition.RearRight]
    case 'tires.fl.surfaceTemp': return roundToEven(frame.tires[TirePosition.FrontLeft].tempSurface)
    case 'tires.fr.surfaceTemp': return roundToEven(frame.tires[TirePosition.FrontRight].tempSurface)
    case 'tires.rl.surfaceTemp': return roundToEven(frame.tires[TirePosition.RearLeft].tempSurface)
    case 'tires.rr.surfaceTemp': return roundToEven(frame.tires[TirePosition.RearRight].tempSurface)
    case 'profile.driverName': return context.settings?.driverName
    case 'profile.driverNumber': return context.settings?.driverNumber
    default: return undefined
  }
}

function flagSummary(flags: TelemetryFrame['flags']): string {
  if (flags.red) return 'RED'
  if (flags.safetyCar) return 'SC'
  if (flags.vsc) return 'VSC'
  if (flags.yellow || flags.doubleYellow) return 'YELLOW'
  return flags.checkered ? 'CHECKERED' : 'GREEN'
}
