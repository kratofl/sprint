import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { TirePosition, type TelemetryFrame } from '@sprint/types'
import { DashRenderer } from './DashRenderer'
import type { DashAlertBanner } from './alerts'
import type { DashLayout, DashPage, DashWidget, DashWidgetStack } from './index'
import { formatLap } from './format'

function tire(position: TirePosition): TelemetryFrame['tires'][number] {
  return { position, tempInner: 0, tempMiddle: 0, tempOuter: 0, tempSurface: 0, tempCore: 0, pressureKPa: 0, wearPercent: 0, compound: '' }
}

function frame(overrides: Partial<TelemetryFrame['lap']> = {}): TelemetryFrame {
  return {
    timestamp: 0,
    session: { game: 'LMU', track: 'Le Mans', trackLengthMeters: null, car: 'Hypercar', carClass: '', sessionType: 'race', sessionTime: 0, totalSessionTime: null, sessionTimeRemaining: null, bestLapTime: 0, maxLaps: 0, inCar: true },
    car: { speedMS: 0, gear: 0, rpm: 0, maxRPM: 0, throttle: 0, brake: 0, clutch: 0, steering: 0, fuel: 0, fuelPerLap: 0, positionX: 0, positionY: 0, positionZ: 0, brakeBiasRear: 0.5 },
    tires: [tire(TirePosition.FrontLeft), tire(TirePosition.FrontRight), tire(TirePosition.RearLeft), tire(TirePosition.RearRight)],
    lap: { currentLap: 0, currentLapTime: 92.345, positionLapTime: 0, lastLapTime: 0, bestLapTime: 0, targetLapTime: 0, delta: 0, sector: 0, sector1Time: 0, sector2Time: 0, lastLapSectorsSeconds: [], isInLap: false, isOutLap: false, isValid: true, trackPosition: 0, ...overrides },
    flags: { yellow: false, doubleYellow: false, red: false, safetyCar: false, vsc: false, checkered: false },
    electronics: { tcActive: false, tc: 0, tcMax: 9, tcCut: 0, tcCutMax: 0, tcSlip: 0, tcSlipMax: 0, absActive: false, abs: 0, absMax: 9, motorMap: 0, motorMapMax: 9, drsActive: false, absAvailable: true, tcAvailable: true, tcCutAvailable: false, tcSlipAvailable: false, motorMapAvailable: true },
    race: { position: 0, totalPositions: 0, gapAhead: 0, gapBehind: 0 },
    energy: { virtualEnergy: 0, virtualEnergyPerLap: 0, soc: 0, regenPower: 0, deployPower: 0 },
    penalties: { incidents: 0, trackLimitSteps: 0, pitStops: 0 },
    conditions: { pathWetness: null, trackGripLevel: null, fuelMultiplier: null, tireMultiplier: null, fixedSetup: null },
  }
}

function widget(overrides: Partial<DashWidget> = {}): DashWidget {
  return { id: 'w1', type: 'text', col: 0, row: 0, colSpan: 20, rowSpan: 12, ...overrides }
}

function page(overrides: Partial<DashPage> = {}): DashPage {
  return { id: 'p1', name: 'Page 1', widgets: [], ...overrides }
}

function layout(overrides: Partial<DashLayout> = {}): DashLayout {
  return { id: 'l1', name: 'Layout', default: true, mode: 'basic', gridCols: 20, gridRows: 12, pages: [], alerts: [], ...overrides }
}

test('a widget renders the value bound to its telemetry channel', () => {
  const html = renderToStaticMarkup(
    <DashRenderer layout={layout({ pages: [page({ widgets: [widget({ type: 'lap_time' })] })] })} frame={frame({ currentLapTime: 92.345 })} width={800} height={480} />,
  )
  assert.ok(html.includes(formatLap(92.345)), html)
})

test('a widget stack renders its defaultLayerId layer, not the others', () => {
  const stack: DashWidgetStack = {
    id: 's1',
    name: 'Stack',
    col: 0,
    row: 0,
    colSpan: 20,
    rowSpan: 12,
    defaultLayerId: 'layer-b',
    layers: [
      { id: 'layer-a', name: 'A', widgets: [widget({ id: 'a', type: 'text', config: { content: 'LAYER A TEXT' } })] },
      { id: 'layer-b', name: 'B', widgets: [widget({ id: 'b', type: 'text', config: { content: 'LAYER B TEXT' } })] },
    ],
  }
  const html = renderToStaticMarkup(<DashRenderer layout={layout({ pages: [page({ widgetStacks: [stack] })] })} frame={frame()} width={800} height={480} />)
  assert.ok(html.includes('LAYER B TEXT'), html)
  assert.ok(!html.includes('LAYER A TEXT'), html)
})

test('an alert banner renders its title and value when one is supplied', () => {
  const banner: DashAlertBanner = {
    title: 'TRACTION CONTROL',
    value: '5',
    color: '#4F9CFF',
    col: 6,
    row: 3,
    colSpan: 8,
    rowSpan: 6,
    gridCols: 20,
    gridRows: 12,
    invertColors: false,
    condition: 'assistActive',
  }
  const withBanner = renderToStaticMarkup(<DashRenderer layout={layout({ pages: [page()] })} frame={frame()} width={800} height={480} alertBanner={banner} />)
  const withoutBanner = renderToStaticMarkup(<DashRenderer layout={layout({ pages: [page()] })} frame={frame()} width={800} height={480} alertBanner={null} />)
  assert.ok(withBanner.includes('TRACTION CONTROL'), withBanner)
  assert.ok(!withoutBanner.includes('TRACTION CONTROL'), withoutBanner)
})

test('the idle page renders instead of the first page when idle is requested', () => {
  const built = layout({
    pages: [page({ id: 'live', widgets: [widget({ type: 'text', config: { content: 'LIVE PAGE' } })] })],
    idlePage: page({ id: 'idle', widgets: [widget({ type: 'text', config: { content: 'IDLE PAGE' } })] }),
  })
  const idleHtml = renderToStaticMarkup(<DashRenderer layout={built} frame={frame()} width={800} height={480} idle />)
  const liveHtml = renderToStaticMarkup(<DashRenderer layout={built} frame={frame()} width={800} height={480} />)
  assert.ok(idleHtml.includes('IDLE PAGE'), idleHtml)
  assert.ok(!idleHtml.includes('LIVE PAGE'), idleHtml)
  assert.ok(liveHtml.includes('LIVE PAGE'), liveHtml)
})

test('a widget is placed at the pixel rect its grid col/row/span maps to', () => {
  // 20 cols over 800px = 40px/col; 12 rows over 480px = 40px/row. col 5 row 2, span 4x3.
  const html = renderToStaticMarkup(
    <DashRenderer layout={layout({ pages: [page({ widgets: [widget({ type: 'text', col: 5, row: 2, colSpan: 4, rowSpan: 3 })] })] })} frame={frame()} width={800} height={480} />,
  )
  assert.match(html, /left:200px/)
  assert.match(html, /top:80px/)
  assert.match(html, /width:160px/)
  assert.match(html, /height:120px/)
})

test('an unknown widget type falls back to a placeholder instead of throwing', () => {
  assert.doesNotThrow(() => {
    const html = renderToStaticMarkup(
      <DashRenderer layout={layout({ pages: [page({ widgets: [widget({ type: 'not-a-real-widget' })] })] })} frame={frame()} width={800} height={480} />,
    )
    assert.ok(html.includes('NOT-A-REAL-WIDGET'), html)
  })
})
