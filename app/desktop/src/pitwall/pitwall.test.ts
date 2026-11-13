import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { FieldEntry, PitWallCar, PitWallLayout, PitWallPage, PitWallTile, PitWallTrace } from './pitWallData'
import { parsePitWall, parsePitWallLayout, parsePitWallTrace } from './pitWallData'
import { addPage, addTile, deletePage, duplicatePage, freeSpot, moveLayer, moveTile, overDraft, removeLayer, resizeTile, setDetached, setStackOptions, shownPage, stackOnto, unstack } from './layoutOps'
import { waiting } from './waiting'
import type { LinkHealth, LinkPeer, LiveLink } from '../bridge'
import { pickLayer, shownLayer, startStack, stepStack } from './stack'
import { carNumber, gapCell, lapClock, placesGained, relativeRows, sectorMarks, sectorStarts, timingSummary } from './timing'
import { fullStintLaps, planStints, range, stintRows, strategy } from './fuel'
import type { SessionPlan } from '../views/SessionPlannerDomain'
import { damageRows, liveDelta, pressureRange, tyreHeat, worstZone } from './carDomain'
import { feedLine, flagState, outCell, stoppedCars, stoppedSummary } from './raceControl'
import { rejoin, trafficText } from './pitStop'

const basePlan: SessionPlan = {
  id: 'plan', name: 'Spa 6h', game: 'LMU', car: 'Porsche 963', track: 'Spa', status: 'Tracking', mode: 'Planned', qualifyingIncluded: true,
  raceLengthFormat: 'LapBased', raceLengthValue: 172, fuelReserveLaps: 1, avgLapTimeSeconds: 125, fuelPerLapLiters: 3.5, setupReferences: [], notes: '',
  createdAt: '', startedAt: null, endedAt: null, segments: [], targets: [], warnings: [],
}

const tile = (id: string, x: number, y: number, w: number, h: number, layers: PitWallTile['layers'] = ['timing']): PitWallTile => ({
  id, layers, x, y, w, h, cycleSeconds: 10, pauseOnHover: true, jumpRadar: true, jumpDamage: true, detached: false, bounds: null,
})
const page = (id: string, tiles: PitWallTile[]): PitWallPage => ({ id, name: id, detached: false, bounds: null, tiles })
const layoutOf = (...pages: PitWallPage[]): PitWallLayout => ({ pages, mainBounds: null })
const tilesOf = (layout: PitWallLayout | null, pageId = 'race') => layout?.pages.find((candidate) => candidate.id === pageId)?.tiles ?? []

test('a tile moves and resizes only onto free cells inside the 12 × 8 grid', () => {
  const layout = layoutOf(page('race', [tile('a', 0, 0, 4, 4), tile('b', 4, 0, 4, 4)]))
  assert.deepEqual(tilesOf(moveTile(layout, 'race', 'a', 0, 4))[0], { ...tile('a', 0, 4, 4, 4) })
  assert.equal(moveTile(layout, 'race', 'a', 2, 0), null, 'onto b')
  assert.equal(moveTile(layout, 'race', 'a', 10, 0), null, 'off the grid')
  assert.equal(resizeTile(layout, 'race', 'a', 5, 4), null, 'into b')
  assert.equal(tilesOf(resizeTile(layout, 'race', 'a', 4, 8))[0].h, 8)
})

test('a new tile takes the first free spot, shrinking when the page is nearly full', () => {
  const full = layoutOf(page('race', [tile('a', 0, 0, 12, 7)]))
  const added = tilesOf(addTile(full, 'race', 'radar', 'r'))
  assert.deepEqual(added.map((entry) => [entry.id, entry.x, entry.y, entry.w, entry.h]), [['a', 0, 0, 12, 7], ['r', 0, 7, 3, 1]])
  assert.equal(freeSpot(page('p', [tile('a', 0, 0, 12, 8)]), { w: 2, h: 2 }), null)
  assert.equal(addTile(layoutOf(page('race', [tile('a', 0, 0, 12, 8)])), 'race', 'radar', 'r'), null)
})

test('dropping a tile onto another stacks it there, without repeats and up to six layers', () => {
  const layout = layoutOf(page('race', [tile('rel', 0, 0, 3, 3, ['relative']), tile('rad', 3, 0, 3, 3, ['radar', 'relative'])]))
  const stacked = tilesOf(stackOnto(layout, 'race', 'rad', 'rel'))
  assert.deepEqual(stacked.map((entry) => [entry.id, entry.layers, entry.x]), [['rel', ['relative', 'radar'], 0]])
  const same = layoutOf(page('race', [tile('a', 0, 0, 3, 3, ['radar']), tile('b', 3, 0, 3, 3, ['radar'])]))
  assert.equal(stackOnto(same, 'race', 'a', 'b'), null, 'nothing new joins')
  const big = layoutOf(page('race', [tile('a', 0, 0, 3, 3, ['radar', 'damage', 'relative', 'fuel', 'target', 'stint']), tile('b', 3, 0, 3, 3, ['tyres'])]))
  assert.equal(stackOnto(big, 'race', 'b', 'a'), null, 'seven layers')
})

test('layers reorder and leave a stack, and unstacking places each layer on its own', () => {
  const layout = layoutOf(page('race', [tile('s', 0, 0, 3, 3, ['relative', 'radar', 'damage'])]))
  assert.deepEqual(tilesOf(moveLayer(layout, 'race', 's', 1, -1))[0].layers, ['radar', 'relative', 'damage'])
  assert.equal(moveLayer(layout, 'race', 's', 0, -1), null)
  assert.deepEqual(tilesOf(removeLayer(layout, 'race', 's', 2))[0].layers, ['relative', 'radar'])
  assert.equal(removeLayer(layoutOf(page('race', [tile('t', 0, 0, 3, 3, ['radar'])])), 'race', 't', 0), null)
  let n = 0
  const split = tilesOf(unstack(layout, 'race', 's', () => `new-${++n}`))
  assert.deepEqual(split.map((entry) => [entry.id, entry.layers, entry.x, entry.y]), [['s', ['relative'], 0, 0], ['new-1', ['radar'], 3, 0], ['new-2', ['damage'], 6, 0]])
  assert.equal(unstack(layoutOf(page('race', [tile('s', 0, 0, 12, 8, ['relative', 'radar'])])), 'race', 's', () => 'x'), null, 'no room')
})

test('stack switching accepts 3 to 120 seconds or by hand', () => {
  const layout = layoutOf(page('race', [tile('s', 0, 0, 3, 3, ['relative', 'radar'])]))
  assert.equal(tilesOf(setStackOptions(layout, 'race', 's', { cycleSeconds: null }))[0].cycleSeconds, null)
  assert.equal(tilesOf(setStackOptions(layout, 'race', 's', { cycleSeconds: 30, pauseOnHover: false }))[0].pauseOnHover, false)
  assert.equal(setStackOptions(layout, 'race', 's', { cycleSeconds: 2 }), null)
  assert.equal(setStackOptions(layout, 'race', 's', { cycleSeconds: 121 }), null)
})

test('pages add, duplicate with fresh tile ids, detach, and the last page stays', () => {
  const layout = layoutOf(page('race', [tile('a', 0, 0, 3, 3)]), page('car', []))
  const added = addPage(layout, 'p3', '  Strategy ')
  assert.deepEqual(added?.pages.map((entry) => entry.name), ['race', 'car', 'Strategy'])
  assert.equal(addPage(layout, 'p4', ' '), null)
  assert.equal(addPage(layout, 'p4', 'x'.repeat(41)), null)
  const copy = duplicatePage(layout, 'race', 'race2', () => 't2')
  assert.deepEqual(copy?.pages.map((entry) => [entry.id, entry.name, entry.tiles.map((t) => t.id)]), [['race', 'race', ['a']], ['race2', 'race copy', ['t2']], ['car', 'car', []]])
  const detached = setDetached(layout, { kind: 'page', id: 'race' }, true)
  assert.equal(shownPage(detached ?? layout, 'race')?.id, 'car', 'a detached page is not shown on the wall')
  assert.equal(setDetached(layout, { kind: 'tile', id: 'a' }, true)?.pages[0].tiles[0].detached, true)
  assert.equal(deletePage(layoutOf(page('race', [])), 'race'), null)
  assert.deepEqual(deletePage(layout, 'race')?.pages.map((entry) => entry.id), ['car'])
})

const signals = (now: number, extra: Partial<Parameters<typeof shownLayer>[2]> = {}) => ({ now, hovered: false, radar: [], damage: null, ...extra })
const stackTile: Pick<PitWallTile, 'layers' | 'cycleSeconds' | 'pauseOnHover' | 'jumpRadar' | 'jumpDamage'> = { layers: ['relative', 'radar', 'damage'], cycleSeconds: 10, pauseOnHover: true, jumpRadar: true, jumpDamage: true }
const hit = (sessionTime: number) => ({ dents: [0, 0, 0, 0, 0, 0, 0, 0], lastImpact: { sessionTime, magnitude: 12, lap: 4 }, overheating: false, detachedParts: false })

test('a stack cycles every N seconds, pauses under the mouse, and can be picked by hand', () => {
  let run = startStack()
  run = stepStack(stackTile, run, signals(0), 0)
  run = stepStack(stackTile, run, signals(9000), 9000)
  assert.equal(shownLayer(stackTile, run, signals(9000)).secondsToNext, 1)
  run = stepStack(stackTile, run, signals(10000), 1000)
  assert.equal(shownLayer(stackTile, run, signals(10000)).kind, 'radar')
  const hovered = stepStack(stackTile, run, signals(30000, { hovered: true }), 20000)
  assert.equal(hovered.base, 1, 'paused while hovered')
  assert.equal(shownLayer(stackTile, hovered, signals(30000, { hovered: true })).paused, true)
  assert.equal(shownLayer(stackTile, pickLayer(run, 2), signals(0)).kind, 'damage')
  const byHand = { ...stackTile, cycleSeconds: null }
  assert.equal(stepStack(byHand, run, signals(99000), 99000).base, 1)
})

test('a stack jumps to the radar while a car is alongside and to damage for 20 s after a new hit', () => {
  let run = stepStack(stackTile, startStack(), signals(0, { damage: hit(50) }), 0)
  assert.equal(shownLayer(stackTile, run, signals(0, { damage: hit(50) })).kind, 'relative', 'an old hit never jumps')
  const alongside = signals(0, { radar: [{ id: 1, driver: 'T. Okafor', right: 3, ahead: 1 }] })
  assert.equal(shownLayer(stackTile, run, alongside).jumped, 'radar')
  assert.equal(shownLayer(stackTile, run, signals(0, { radar: [{ id: 1, driver: 'T. Okafor', right: 3, ahead: 20 }] })).jumped, null, 'a car well ahead')
  run = stepStack(stackTile, run, signals(1000, { damage: hit(80) }), 1000)
  assert.equal(shownLayer(stackTile, run, signals(1000)).kind, 'damage')
  run = stepStack(stackTile, run, signals(15000, { damage: hit(80) }), 14000)
  assert.equal(run.base, 0, 'the cycle waits during a jump')
  run = stepStack(stackTile, run, signals(21001, { damage: hit(80) }), 6001)
  assert.equal(shownLayer(stackTile, run, signals(21001)).kind, 'relative', 'then back to where it was')
})

test('a stack that starts before any board arrives still treats the first hit it sees as old', () => {
  let run = stepStack(stackTile, startStack(), signals(0), 0)
  run = stepStack(stackTile, run, signals(1000, { damage: hit(50) }), 1000)
  assert.equal(shownLayer(stackTile, run, signals(1000, { damage: hit(50) })).jumped, null)
  run = stepStack(stackTile, run, signals(2000, { damage: hit(90) }), 1000)
  assert.equal(shownLayer(stackTile, run, signals(2000)).kind, 'damage', 'a hit after that jumps')
})

const car = (id: number, place: number, extra: Partial<FieldEntry> = {}): FieldEntry => ({
  id, driver: `Driver ${id}`, car: `Porsche 963 #${id}`, carClass: 'Hypercar', isPlayer: false, place, classPlace: place, startPlace: null,
  lapsCompleted: 10, lapFraction: 0.5, sector: 2, lastLap: 125, bestLap: 124.5, lastSectors: [36, 54, 35], bestSectors: [35.9, 53.8, 35],
  gapToLeader: 0, lapsToLeader: 0, gapToNext: 0, lapsToNext: 0, inPit: false, pitState: 'None', pitStops: 0, penalties: 0, blueFlag: false, finishStatus: 'None', stopped: false, compound: 'Medium', x: 0, z: 0, ...extra,
})

test('the flag strip puts a full course yellow over local yellows and names the yellow sectors', () => {
  assert.deepEqual(flagState({ phase: 'Green', yellowSectors: [false, true, true] }), { label: 'Yellow · S2 S3', tone: 'yellow', sectors: [false, true, true] })
  assert.equal(flagState({ phase: 'Green', yellowSectors: [false, false, false] }).label, 'Green')
  assert.equal(flagState({ phase: 'FullCourseYellow', yellowSectors: [true, false, false] }).tone, 'fcy')
  assert.equal(flagState({ phase: 'Stopped', yellowSectors: [false, false, false] }).label, 'Red flag')
})

test('race control reads each change in words, and says whom a blue flag is for', () => {
  const player = car(1, 3, { isPlayer: true, car: 'Oreca #63' })
  const event = (kind: Parameters<typeof feedLine>[0]['kind'], extra: Partial<Parameters<typeof feedLine>[0]> = {}) =>
    ({ time: 4321, kind, carId: 28, driver: 'J. Marchetti', car: 'Oreca #28', sector: null, lap: 31, ...extra })
  assert.deepEqual(feedLine(event('CarStopped', { sector: 2 }), 0, player), { key: '0', time: '1:12:01', text: '#28 J. Marchetti stopped', note: 'S2 · lap 31', tone: 'yellow' })
  assert.equal(feedLine(event('BlueFlag'), 0, player).note, 'for #63')
  assert.equal(feedLine(event('BlueFlag', { carId: 1, car: 'Oreca #63' }), 0, player).note, '', 'our own blue flag is for nobody in particular')
  assert.equal(feedLine(event('SectorYellow', { carId: null, sector: 2, lap: null }), 0, player).text, 'Yellow in sector 2')

  const wall = { field: [car(28, 6, { stopped: true, car: 'Oreca #28' })], raceControl: [event('CarStopped', { sector: 2 })] }
  assert.equal(stoppedSummary(stoppedCars(wall)), '#28 stopped in S2 · since 1:12:01')
  assert.equal(outCell({ finishStatus: 'Dnf', lapsCompleted: 21 }), 'DNF · lap 22')
})

test('a stop moves our car back by the loss: rejoin place, the class cars round it and traffic at the exit', () => {
  const field = [
    car(1, 3, { isPlayer: true, car: 'Oreca #63', carClass: 'LMP2', lapsCompleted: 10, lapFraction: 0.5, lastLap: 120 }),
    car(2, 1, { carClass: 'LMP2', lapsCompleted: 10, lapFraction: 0.2, lastLap: 120 }),
    car(3, 4, { carClass: 'LMP2', lapsCompleted: 9, lapFraction: 0.95, lastLap: 120 }),
    car(4, 5, { carClass: 'LMGT3', lapsCompleted: 9, lapFraction: 0.01, lastLap: 130 }),
    car(5, 2, { carClass: 'LMP2', lapsCompleted: 12, lapFraction: 0.1, finishStatus: 'Dnf' }),
  ]
  const now = rejoin(field, 60)
  assert.ok(now)
  assert.equal(now.classPlace, 2, 'behind #2 only: the retired car does not count')
  assert.equal(now.ahead?.entry.id, 2)
  assert.ok(Math.abs((now.ahead?.seconds ?? 0) - 24) < 1e-9)
  assert.equal(now.behind?.entry.id, 3)
  assert.ok(Math.abs((now.behind?.seconds ?? 0) + 6) < 1e-9)
  assert.equal(now.traffic?.entry.id, 4)
  assert.equal(trafficText(now.traffic, (entry) => `#${entry.id}`), '#4 1.2 s ahead at the exit')
  assert.ok(Math.abs(now.fraction) < 1e-9, 'out at the line')
  assert.equal(rejoin(field.slice(1), 60), null, 'no car of ours')
})

test('timing reads gaps, numbers, lap times and places gained', () => {
  assert.equal(lapClock(124.94), '2:04.9')
  assert.equal(lapClock(119.96), '2:00.0')
  assert.equal(lapClock(null), '—')
  assert.equal(gapCell(9.81, 0, false), '+9.8')
  assert.equal(gapCell(70, 3, false), '+3 L')
  assert.equal(gapCell(0, 0, true), 'Leader')
  assert.equal(gapCell(-186.3, 0, false), '—')
  assert.equal(carNumber({ car: 'Porsche Penske 2024 #63:LM', id: 7 }), '63')
  assert.equal(carNumber({ car: 'Porsche 963', id: 7 }), '7')
  assert.equal(placesGained({ startPlace: 7, place: 3 }), 4)
  assert.equal(placesGained({ startPlace: 2, place: 5 }), -3)
  assert.equal(placesGained({ startPlace: null, place: 5 }), null)
})

test('sectors go purple for the class best and green for the car’s own best', () => {
  const field = [
    car(1, 1, { lastSectors: [35.5, 54, 35.4], bestSectors: [35.5, 53.6, 35.2] }),
    car(2, 2, { lastSectors: [35.8, 53.6, 35.3], bestSectors: [35.7, 53.6, 35.3] }),
    car(3, 3, { carClass: 'LMGT3', lastSectors: [40.2, 61, null], bestSectors: [40.2, 60, 40] }),
  ]
  const marks = sectorMarks(field)
  assert.deepEqual(marks.get(1), ['purple', null, null])
  assert.deepEqual(marks.get(2), [null, 'purple', 'green'])
  assert.deepEqual(marks.get(3), ['purple', null, null], 'purple within its own class')
})

test('the summary and the relative read the player’s car', () => {
  const field = [
    car(12, 1, { lapFraction: 0.30, bestLap: 124.3 }),
    car(41, 2, { lapFraction: 0.25 }),
    car(63, 3, { isPlayer: true, lapsCompleted: 33, lapFraction: 0.22, lastLap: 125.1, bestLap: 124.8, classPlace: 3 }),
    car(17, 4, { lapFraction: 0.21 }),
    car(46, 9, { lapsCompleted: 30, lapFraction: 0.20, carClass: 'LMGT3' }),
    car(28, 5, { inPit: true, lapFraction: 0.23 }),
  ]
  const summary = timingSummary({ session: { track: 'Spa', trackLengthMeters: 7004, sessionType: 'Race', timeRemaining: 18760, totalTime: 21600, maxLaps: 0, airTemp: null, trackTemp: null, wetness: null, raining: null, gripLevel: null }, field })
  assert.equal(summary.position, 'P3 · class P3')
  assert.equal(summary.timeLeft, '5:12:40')
  assert.equal(summary.overallBest, '2:04.3 · #12')
  assert.equal(summary.lap, `34 / ≈${Math.round(33 + 18760 / 125.1)}`)
  const rows = relativeRows(field, 2)
  assert.deepEqual(rows.map((row) => row.entry.id), [12, 41, 63, 17, 46])
  assert.equal(rows[0].seconds < rows[1].seconds, true, 'furthest ahead first')
  assert.equal(rows[4].note, 'lap down')
})

test('sector starts sit between the cars of neighbouring sectors', () => {
  const field = [car(1, 1, { sector: 1, lapFraction: 0.1 }), car(2, 2, { sector: 1, lapFraction: 0.26 }), car(3, 3, { sector: 2, lapFraction: 0.32 }),
    car(4, 4, { sector: 2, lapFraction: 0.68 }), car(5, 5, { sector: 3, lapFraction: 0.74 })]
  assert.deepEqual(sectorStarts(field)?.map((start) => start.toFixed(2)), ['0.29', '0.71'])
  assert.equal(sectorStarts(field.slice(0, 3)), null)
})

const pitCar = (extra: Partial<PitWallCar> = {}): PitWallCar => ({
  tyres: [], fuelLiters: 38.6, fuelPerLapLiters: 3.51, fuelCapacityLiters: 90, virtualEnergy: 0.42, virtualEnergyPerLap: 0.039, battery: 0.63, damage: null, ...extra,
})

test('the fuel tile knows which runs out first, when to box and what is left at the flag', () => {
  const left = range(pitCar())
  assert.equal(left.limit, 'energy')
  assert.equal(left.laps?.toFixed(1), '10.8')
  assert.equal(range(pitCar({ virtualEnergy: null, virtualEnergyPerLap: null })).limit, null)
  assert.equal(fullStintLaps(pitCar())?.toFixed(1), (1 / 0.039).toFixed(1))
  const plan = strategy(pitCar(), 33, 138)
  assert.equal(plan?.boxLap, 43)
  assert.equal(plan?.stopsLeft, Math.ceil((138 - 0.42 / 0.039) / (1 / 0.039)))
  assert.equal(strategy(pitCar(), 33, null)?.stopsLeft, null)
  assert.equal(strategy(pitCar({ fuelPerLapLiters: 0, virtualEnergyPerLap: null }), 33, 10), null)
})

test('stints come from the plan’s race length over a full tank', () => {
  const stints = planStints(basePlan, pitCar({ fuelCapacityLiters: 88 }), 33)
  assert.equal(stints?.length, 7)
  assert.deepEqual(stints?.slice(0, 2).map((stint) => [stint.firstLap, stint.lastLap, stint.state]), [[1, 25, 'done'], [26, 50, 'current']])
  assert.deepEqual(stintRows(stints ?? []).map((row) => row.label), ['1', '2', '3', '4', '5–7'])
  assert.equal(planStints(basePlan, pitCar({ fuelCapacityLiters: null }), 33), null)
})

test('tyre heat, damage words and the pressure range', () => {
  assert.deepEqual([70, 85, 95, 101].map(tyreHeat), ['cold', 'ok', 'warm', 'hot'])
  const damage = { dents: [0, 1, 2, 0, 0, 0, 0, 1], lastImpact: null, overheating: true, detachedParts: false }
  assert.deepEqual(damageRows(damage).map((row) => `${row.label}: ${row.word}`), ['Front bodywork: Heavy damage', 'Left side: Light damage', 'Right side: OK', 'Rear bodywork: OK', 'Parts: All on', 'Engine: Overheating'])
  assert.equal(worstZone(damage), 'frontRight')
  assert.deepEqual(pressureRange([{ lap: 26, fl: 163, fr: 164, rl: 162, rr: 163 }]), { min: 160, max: 174 })
})

const trace = (speed: number, points = 101, until = 1): PitWallTrace => {
  const distance = Array.from({ length: points }, (_, index) => (index / Math.max(1, points - 1)) * until)
  return { lap: 3, lapTime: null, distance, speed: distance.map(() => speed), throttle: distance.map(() => 1), brake: distance.map(() => 0), steering: distance.map(() => 0) }
}

test('the live delta integrates speed over the lap so far', () => {
  const target = trace(200)
  const half = trace(180, 51, 0.5)
  // 3600 m at 180 km/h = 72 s; the target there: 3600 m at 200 km/h = 64.8 s.
  assert.equal(liveDelta(half, target, 7200)?.toFixed(1), '7.2')
  assert.equal(liveDelta(half, target, null), null)
  assert.equal(liveDelta(trace(180, 1), target, 7200), null)
})

test('host payloads narrow once and drop what does not fit', () => {
  assert.equal(parsePitWall(null), null)
  const wall = parsePitWall({ session: { sessionType: 'Bogus' }, field: [{ id: 1, lastSectors: [30, 'x'] }, { driver: 'no id' }], car: { tyres: [{ position: 'RearLeft' }, { position: 'FrontLeft' }] }, plan: null })
  assert.equal(wall?.session.sessionType, 'Unknown')
  assert.deepEqual(wall?.field.map((entry) => entry.lastSectors), [[30, null, null]])
  assert.deepEqual(wall?.car.tyres.map((entry) => entry.position), ['FrontLeft', 'RearLeft'])
  assert.deepEqual(wall?.car.damage, null)
  assert.equal(parsePitWallLayout({ pages: [] }), null)
  const layout = parsePitWallLayout({ pages: [{ id: 'p', name: 'Race', tiles: [{ id: 't', layers: ['radar', 'nope'], x: 0, y: 0, w: 3, h: 3 }, { id: 'u', layers: [] }] }] })
  assert.deepEqual(layout?.pages[0].tiles.map((entry) => entry.layers), [['radar']])
  assert.deepEqual(parsePitWallTrace({ distance: [0, 0.5, 1], speed: [100, 200], throttle: [1, 1, 1], brake: [0, 0, 0], steering: [0, 0, 0] }).distance, [0, 0.5])
})

test('Done lays the draft over the newest layout: windows opened, closed or moved meanwhile stay as they are', () => {
  const bounds = { x: 10, y: 20, width: 800, height: 600 }
  const saved = layoutOf(page('race', [tile('a', 0, 0, 4, 4), tile('b', 4, 0, 4, 4)]), page('car', []))
  // While editing: tile b went into its own window, the car page was moved, the wall's window too.
  const latest: PitWallLayout = {
    mainBounds: bounds,
    pages: [page('race', [tile('a', 0, 0, 4, 4), { ...tile('b', 4, 0, 4, 4), detached: true, bounds }]), { ...page('car', []), detached: true, bounds }],
  }
  // The draft moved a, unstacked into a new tile c, and still has b and the car page as they were.
  const draft = layoutOf(page('race', [tile('a', 0, 4, 4, 4), tile('b', 4, 0, 4, 4), { ...tile('c', 8, 0, 4, 4), detached: false }]), page('car', []))
  const merged = overDraft(draft, latest)
  assert.deepEqual(merged.mainBounds, bounds)
  assert.deepEqual(tilesOf(merged).map((entry) => [entry.id, entry.y, entry.detached, entry.bounds]), [['a', 4, false, null], ['b', 0, true, bounds], ['c', 0, false, null]])
  assert.deepEqual([merged.pages[1].detached, merged.pages[1].bounds], [true, bounds])
  assert.deepEqual(overDraft(saved, saved), saved)
})

test('a duplicated page name is cut to 40 characters without a trailing space', () => {
  // 39 characters, so "<name> copy" cut at 40 ends in the space before "copy".
  const name = 'Spa 6 Hours, night stint, wet setup tyre'.slice(0, 39)
  const copy = duplicatePage(layoutOf({ ...page('race', []), name }), 'race', 'race2', () => 't')
  assert.equal(copy?.pages[1].name, name)
})

test('with no board the wall says why once, by the link phase', () => {
  const health: LinkHealth = { path: 'Ipv4', roundTripMs: 30, sampleRate: 20, lossPercent: 0 }
  const linked = (role: 'Driver' | 'Engineer', withBoard: boolean, peer: LinkPeer | null = null): LiveLink => ({
    phase: 'Connected', role, reachability: 'Open', health, session: null, latest: null, peer, sharingPlan: true, sharedPlan: null,
    pitWall: withBoard ? parsePitWall({ session: {}, field: [], car: {}, plan: null }) : null,
  })
  assert.equal(waiting({ phase: 'Off' })?.reason, 'Not linked: link from the Live link page.')
  assert.equal(waiting({ phase: 'Ended', role: 'Engineer', detail: 'The driver ended the link.' })?.reason, 'The link ended: link again from the Live link page.')
  assert.equal(waiting(linked('Engineer', false))?.reason, 'Linked: the board shows once the driver is in a session.')
  assert.equal(waiting(linked('Engineer', true)), null)
  assert.match(waiting(linked('Driver', false))?.reason ?? '', /engineer’s PC/)
})

test('a driver on a Sprint from before the pit wall is told apart from one not in a session', () => {
  const health: LinkHealth = { path: 'Ipv4', roundTripMs: 30, sampleRate: 20, lossPercent: 0 }
  const engineer = (peer: LinkPeer | null): LiveLink => ({
    phase: 'Connected', role: 'Engineer', reachability: 'Open', health, session: null, latest: null, peer, sharingPlan: true, sharedPlan: null, pitWall: null,
  })
  assert.equal(waiting(engineer({ app: null, match: 'PeerOlder' }))?.tone, 'warning')
  assert.equal(waiting(engineer({ app: '0.5.0', match: 'Same' }))?.tone, 'info')
  // Before the driver's first ping nothing is known yet: no warning.
  assert.equal(waiting(engineer(null))?.tone, 'info')
})

test('a board from an older or newer driver’s desktop reads with no flags and drops what it does not know', () => {
  const wall = parsePitWall({ session: { track: 'Spa' }, field: [{ id: 1 }], car: {}, raceControl: [{ kind: 'Safari', time: 1 }, { kind: 'Penalty', time: 5, carId: 3 }] })
  assert.ok(wall)
  assert.deepEqual(wall.session.yellowSectors, [false, false, false])
  assert.equal(wall.session.phase, 'Unknown')
  assert.deepEqual([wall.field[0].finishStatus, wall.field[0].penalties, wall.field[0].stopped], ['None', 0, false])
  assert.deepEqual(wall.raceControl.map((entry) => entry.kind), ['Penalty'])
  assert.equal(wall.pitLoss.lane, null)
})
