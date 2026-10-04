import * as React from 'react'
import { readFileSync, writeFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { TirePosition, type TelemetryFrame } from '@sprint/types'
import { DashRenderer } from '../src/DashRenderer'
import { parseDashRenderInput } from '../src/index'

const tire = (position: TirePosition, t: number, p: number) => ({
  position, tempInner: t + 6, tempMiddle: t, tempOuter: t - 4, tempSurface: t, tempCore: t - 2,
  pressureKPa: p, wearPercent: 4, compound: 'M',
})

const frame: TelemetryFrame = {
  timestamp: Date.now(),
  session: { game: 'LMU', track: 'Circuit de la Sarthe', trackLengthMeters: 13626, car: 'Porsche 963', carClass: 'Hypercar', sessionType: 'race', sessionTime: 3720, totalSessionTime: 21600, sessionTimeRemaining: 17880, bestLapTime: 208.44, maxLaps: 0, inCar: true },
  car: { speedMS: 78.3, gear: 6, rpm: 7450, maxRPM: 9000, throttle: 0.92, brake: 0, clutch: 0, steering: -0.12, fuel: 62.4, fuelPerLap: 4.6, positionX: 0, positionY: 0, positionZ: 0, brakeBiasRear: 0.462 },
  tires: [tire(TirePosition.FrontLeft, 88, 172), tire(TirePosition.FrontRight, 94, 174), tire(TirePosition.RearLeft, 91, 168), tire(TirePosition.RearRight, 97, 170)],
  lap: { currentLap: 14, currentLapTime: 92.345, positionLapTime: 0, lastLapTime: 210.117, bestLapTime: 208.44, targetLapTime: 209.0, delta: -0.412, sector: 2, sector1Time: 68.2, sector2Time: 71.9, lastLapSectorsSeconds: [68.2, 71.9, 70.0], isInLap: false, isOutLap: false, isValid: true, trackPosition: 0.44 },
  flags: { yellow: false, doubleYellow: false, red: false, safetyCar: false, vsc: false, checkered: false },
  electronics: { tcActive: true, tc: 4, tcMax: 9, tcCut: 3, tcCutMax: 9, tcSlip: 2, tcSlipMax: 9, absActive: false, abs: 3, absMax: 9, motorMap: 5, motorMapMax: 9, drsActive: false, absAvailable: true, tcAvailable: true, tcCutAvailable: true, tcSlipAvailable: true, motorMapAvailable: true },
  race: { position: 4, totalPositions: 38, gapAhead: 2.41, gapBehind: 5.08 },
  energy: { virtualEnergy: 61.2, virtualEnergyPerLap: 4.4, soc: 0.58, regenPower: 120, deployPower: 340 },
  penalties: { incidents: 1, trackLimitSteps: 0, pitStops: 2 },
  conditions: { pathWetness: null, trackGripLevel: null, fuelMultiplier: null, tireMultiplier: null, fixedSetup: null },
}

const preset = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const { layout } = parseDashRenderInput({ layout: preset })
const W = 800, H = 480

const body = renderToStaticMarkup(<DashRenderer layout={layout} frame={frame} width={W} height={H} />)
const css = readFileSync('src/styles.css', 'utf8')
const fonts = process.argv[3]

writeFileSync(process.argv[4], `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;font-weight:400;src:url('${fonts}/Inter-Regular.ttf')}
@font-face{font-family:Inter;font-weight:600;src:url('${fonts}/Inter-SemiBold.ttf')}
@font-face{font-family:Inter;font-weight:700;src:url('${fonts}/Inter-Bold.ttf')}
@font-face{font-family:'Saira SemiCondensed';font-weight:400;src:url('${fonts}/SairaSemiCondensed-Regular.ttf')}
@font-face{font-family:'Saira SemiCondensed';font-weight:500;src:url('${fonts}/SairaSemiCondensed-Medium.ttf')}
@font-face{font-family:'Saira SemiCondensed';font-weight:700;src:url('${fonts}/SairaSemiCondensed-Bold.ttf')}
html,body{margin:0;padding:0;background:#000}
${css}
</style></head><body>${body}</body></html>`)
console.log('wrote', process.argv[4])
