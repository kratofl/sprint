// Preview stand-in for Electron's preload (electron/preload.ts): defines
// `window.sprint` from a static state payload so the built renderer runs in a
// plain browser. Loaded as a classic script before the app's module bundle, so
// bridge.ts sees it exactly like the real bridge. Nothing here ships in the app.
//
// Query parameters (all optional):
//   view=Devices          open that page (any AppView name) once the shell is up
//   theme=dark|light      force a theme; omitted = follow the OS
//   collapsed=1           start with the navigation pane in compact mode
//   palette=1             open the command palette
//   update=1              report an available update (Settings dot + notification)
//   frame=none            drop the live telemetry frame (dash previews then render their no-data state)
//   import=offer          the startup results scan finds sessions (opens the import prompt);
//                         otherwise every scan finds nothing new
//   telemetry=unsupported the Windows-only LMU source as a Mac reports it (Overview game card, sidebar status row and Help's Checks)
//   sprintWeb=1           the Sprint web feature flag is on (accounts, setup, sync). Off by default, as
//                         shipped; any of account/setup/servers/storage/live/discord turns it on too
//   account=signed-in     the desktop is signed in to Sprint (the account row shows the name);
//                         otherwise it is signed out and the row reads "Sign in"
//   setup=first-run       Sprint web setup not done yet, so the setup opens on its welcome step
//   servers=none          the network scan finds no server (default: one at 192.168.1.20)
//   storage=Both|Remote   where data lives (default: This PC only); Both also reports a last upload
//   live=<status>         the live uplink's status (Off, WaitingForGame, Connecting, Streaming, Reconnecting);
//                         default: WaitingForGame when signed in with storage Both/Remote, otherwise Off
//   link=<phase>          the live link's phase (Off, Preparing, Inviting, Joining, Connecting, Connected,
//                         Interrupted, Failed, Ended); linkRole=Engineer shows the engineer's side of
//                         Connected/Interrupted/Failed/Ended (default: Driver). Default: Off
//   found=<id,id>         the USB scan finds these catalog ids plugged in and not added yet (Add device's
//                         "Plugged in now"); default: nothing new
//   discord=1|fail        the server offers Discord sign-in; "Continue with Discord" then waits until
//                         Cancel (1) or fails at once with a server error (fail)
//   click=<css selector>  after the view opens, click the first match (waits up to 2s for it);
//                         repeat the parameter to click several things in order. A trailing @0.46
//                         clicks that far across the element instead of at its left edge (a place
//                         along a chart)
//   focus=<css selector>  after the clicks, focus the first match and point at it: what only focus or
//                         hover shows (the hidden screenshot window never has focus, so it does both)
//   training=on|arrange|none  On track: training (on), the HUD up to arrange (arrange), or no lap has
//                         ever been recorded (none); default: laps listed, Ada's shared lap picked, HUD
//                         off. chase=none picks no lap. fullscreen=1 adds the warning
//   hud=<windowId>        mount one training HUD window instead of the app: delta, throttle, brake, speed,
//                         steering, gear, or arrange (the palette); hudArranging=1 shows a window being
//                         arranged (edge, ×, grip). Screenshot it at its window size
//   designer=<dashId>     mount the dash designer window for that dash instead of the app (click= works in it)
;(() => {
  const params = new URLSearchParams(window.location.search)

  // The host's `link` state (PeerLinkState) for one phase. Inviting is always the driver, Joining the engineer.
  const previewLink = (phase, role) => {
    const code =
      'SPRINT-INVITE-AQH-ZsIo9Kx2LwQEkS7d0bLrP1x8cPTPvcN3Hk-1o1fJYTz0hk2Ww2oL6vVtH4gbqZK9x3Wn1sD7kUu8YBjtP0cJsmV5AxPGM2RkdAEBwKgBFNIr'
    const latest = {
      lap: 14, position: 3, lastLapTime: 138.412, bestLapTime: 137.905, delta: -0.214, lapValid: true,
      speedKph: 287.4, gear: 6, fuel: 41.6,
      tyreTempFl: 88.2, tyreTempFr: 91.6, tyreTempRl: 84.9, tyreTempRr: 86.3,
      tyreWearFl: 18.4, tyreWearFr: 22.1, tyreWearRl: 12.7, tyreWearRr: 14.0,
    }
    const session = { sessionKey: 's1', game: 'Le Mans Ultimate', track: 'Circuit de Spa-Francorchamps', car: 'Porsche 963', sessionType: 'Race' }
    switch (phase) {
      case 'Preparing':
        return { phase, role, reachability: 'Unknown' }
      case 'Inviting':
        return { phase, role: 'Driver', code, reachability: 'Open' }
      case 'Joining':
        return { phase, role: 'Engineer', code: code.replace('INVITE', 'REPLY'), reachability: 'Open' }
      case 'Connecting':
        return { phase, role: 'Driver', reachability: 'Strict' }
      case 'Connected':
      case 'Interrupted':
        return {
          phase, role, reachability: 'Open',
          health: { path: 'Ipv4', roundTripMs: phase === 'Connected' ? 38 : null, sampleRate: phase === 'Connected' ? 20 : 0, lossPercent: phase === 'Connected' ? 0.5 : null },
          session,
          latest: role === 'Engineer' ? latest : null,
        }
      case 'Failed':
        return { phase, role, reachability: 'Strict', detail: 'No direct path between your PCs. One of your networks blocks it, or the reply went stale. Try again with fresh codes.' }
      case 'Ended':
        return { phase, role, reachability: 'Open', detail: role === 'Driver' ? 'Your engineer disconnected.' : 'The driver ended the link.' }
      default:
        return { phase: 'Off', reachability: 'Unknown' }
    }
  }

  const theme = params.get('theme')
  if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme

  const state = structuredClone(window.__SPRINT_PREVIEW_STATE__ ?? {})
  if (params.get('collapsed') === '1') state.settings = { ...state.settings, sidebarCollapsed: true }
  state.foundDevices = (params.get('found') ?? '').split(',').filter((id) => id !== '')
  if (params.get('frame') === 'none' && state.telemetry) state.telemetry = { ...state.telemetry, frame: null }
  // telemetry=unsupported: what a Mac reports: the LMU source is Windows-only. The Overview's game card, the sidebar's status row and Help's Checks say so.
  if (params.get('telemetry') === 'unsupported' && state.telemetry) {
    state.telemetry = {
      ...state.telemetry,
      frame: null,
      status: { ...state.telemetry.status, state: 'Unsupported', detail: 'The LMU_Data shared-memory provider is only supported on Windows.', lastFrameValid: false, isLive: false },
    }
  }
  // Payloads captured before the results import existed carry no `resultsImport`; preview as LMU does.
  state.resultsImport ??= { available: true, sourceName: 'the Le Mans Ultimate results folder' }
  // The first-run setup: off unless asked for. No game on the Mac look, as the host reports there.
  const firstRun = params.get('firstRun')
  state.firstRun =
    firstRun === null
      ? { done: true, game: null }
      : {
          done: false,
          game:
            params.get('platform') === 'mac'
              ? null
              : firstRun === 'missing'
                ? { folder: '', chosen: false, found: false, setupCount: 0, resultsCount: 0 }
                : { folder: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate', chosen: false, found: true, setupCount: 214, resultsCount: 752 },
        }
  state.account =
    params.get('account') === 'signed-in'
      ? { signedIn: true, serverUrl: 'http://localhost:8080', email: 'alex@sprint.local', displayName: 'Alex Morgan' }
      : { signedIn: false, serverUrl: 'http://localhost:8080', email: '', displayName: '' }

  const storage = params.get('storage')
  state.cloud = {
    setupDone: params.get('setup') !== 'first-run',
    server: state.account.signedIn ? 'SelfHosted' : 'None',
    storage: storage === 'Both' || storage === 'Remote' ? storage : 'Local',
    officialServerUrl: null,
    progress: null,
    lastSync:
      storage === 'Both'
        ? { at: '2026-10-06T09:30:00Z', direction: 'upload', report: { uploaded: 14, downloaded: 0, conflicts: 0, removedLocally: 0 } }
        : null,
  }
  const liveDefault = state.account.signedIn && state.cloud.storage !== 'Local' ? 'WaitingForGame' : 'Off'
  const live = params.get('live') ?? liveDefault
  state.cloud.live = {
    status: live,
    detail: live === 'Reconnecting' ? 'Could not reach Sprint web.' : null,
  }
  state.link = previewLink(params.get('link'), params.get('linkRole') === 'Engineer' ? 'Engineer' : 'Driver')
  const sprintWebParams = ['sprintWeb', 'account', 'setup', 'servers', 'storage', 'live', 'discord']
  state.features = { sprintWeb: sprintWebParams.some((name) => params.has(name)) && params.get('sprintWeb') !== '0' }
  const discord = params.get('discord')
  let pendingDiscord = null
  const syncReport = (uploaded, downloaded) => ({ uploaded, downloaded, conflicts: 0, removedLocally: 0 })

  // On track (training against an older lap): laps on the sample's course, the fastest picked.
  const training = params.get('training')
  const spa = { game: 'LeMansUltimate', trackCourse: 'Circuit de Spa-Francorchamps', carModel: 'Porsche 963' }
  const lapOn = (sessionId, lapNumber, seconds, startedAt, tier, sharedFrom = null) => ({
    sessionId, lapNumber, label: `Lap ${lapNumber}`, detail: '', lapTimeSeconds: seconds, tier,
    context: { ...spa, trackLengthMeters: 6981.6, carClass: 'Hypercar' }, sessionStartedAt: startedAt, sharedFrom,
    traceId: `${sessionId}/${lapNumber}`, hasChannels: tier === 'FullTrace',
    unavailableReason: tier === 'FullTrace' ? null : 'Lap time only — imported, or only part of the lap was seen.',
  })
  const trainingLaps = [
    lapOn('shared-ada', 3, 124.88, '2026-10-02T19:10:00+00:00', 'FullTrace', 'Ada Brandt'),
    lapOn('shared-jonas', 7, 125.102, '2026-10-30T20:15:00+00:00', 'FullTrace', 'Jonas K.'),
    lapOn('spa-0928', 5, 125.263, '2026-09-28T18:02:00+00:00', 'FullTrace'),
    lapOn('spa-0928', 1, 125.4, '2026-09-28T18:02:00+00:00', 'FullTrace'),
    lapOn('spa-0928', 4, 125.912, '2026-09-28T18:02:00+00:00', 'FullTrace'),
    lapOn('spa-0920', 3, 126.031, '2026-09-20T17:40:00+00:00', 'TimeOnly'),
    lapOn('spa-0920', 2, 126.4, '2026-09-20T17:40:00+00:00', 'FullTrace'),
  ]
  state.compare =
    training === 'none'
      ? { courses: [], course: null, laps: [], lapCount: 0, target: null, hudOpen: false, arranging: false, fullscreen: false }
      : {
          courses: [spa, { game: 'LeMansUltimate', trackCourse: 'Autodromo Nazionale Monza', carModel: 'Porsche 963' }],
          course: spa,
          laps: trainingLaps,
          lapCount: 42,
          target: params.get('chase') === 'none' ? null : { sessionId: 'shared-ada', lapNumber: 3, label: '2:04.880 · Ada Brandt', lapTimeSeconds: 124.88 },
          hudOpen: training === 'on',
          arranging: training === 'arrange',
          fullscreen: params.get('fullscreen') === '1',
        }
  state.settings = { ...state.settings, liveCompare: { version: 3, panelIds: ['throttle', 'brake', 'speed'], showDelta: true, layouts: [] } }

  // One HUD window's messages (electron/hudFeed.ts): a braking zone 250 m ahead of the car. The
  // delta gets three, 300 m apart, so its gaining/losing trend has track behind it.
  const hudMessages = (windowId, arranging) => {
    const titles = { delta: 'Delta', throttle: 'Throttle', brake: 'Brake', speed: 'Speed', steering: 'Steering', gear: 'Gear', arrange: 'Arrange the HUD' }
    const common = { id: windowId, title: titles[windowId] ?? windowId, arranging, readings: { panelIds: ['throttle', 'brake', 'speed'], showDelta: true } }
    if (windowId === 'arrange') return [{ kind: 'arrange', ...common }]
    if (windowId === 'delta') {
      return [[1400, -0.15], [1700, -0.18], [2000, -0.214]].map(([carMeters, deltaSeconds]) => ({ kind: 'delta', ...common, targetName: '2:04.880 · Ada Brandt', deltaSeconds, carMeters }))
    }
    const car = 2000
    const xs = Array.from({ length: 161 }, (_, index) => 1800 + index * 5)
    const shapes = {
      throttle: { title: 'Throttle', unit: '%', target: (x) => (x > 2220 && x < 2380 ? 0 : x >= 2380 && x < 2430 ? (x - 2380) * 2 : 100), live: () => 100 },
      brake: { title: 'Brake', unit: '%', target: (x) => (x > 2230 && x < 2330 ? Math.max(30, 100 - (x - 2245) * 0.8) : 0), live: () => 0 },
      speed: { title: 'Speed', unit: 'km/h', target: (x) => (x < 2230 ? 285 : x < 2330 ? 285 - (x - 2230) * 1.4 : 145 + (x - 2330) * 0.25), live: (x) => 281 + (x - 1800) * 0.01 },
      steering: { title: 'Steering', unit: '°', target: (x) => (x > 2300 && x < 2450 ? -60 * Math.sin(((x - 2300) / 150) * Math.PI) : 0), live: (x) => 2 * Math.sin(x / 40) },
      gear: { title: 'Gear', unit: null, stepped: true, target: (x) => (x < 2235 ? 6 : x < 2260 ? 5 : x < 2290 ? 4 : x < 2400 ? 3 : x < 2480 ? 4 : 5), live: () => 6 },
    }
    const shape = shapes[windowId]
    if (!shape) return [{ kind: 'chart', ...common, panel: null, domain: null, carMeters: null }]
    const series = (name, role, f, upTo) => ({
      name, role, interpolation: shape.stepped ? 'Stepped' : 'Linear', fillArea: false,
      samples: xs.filter((x) => x <= upTo).map((x) => ({ x, y: f(x) })),
    })
    return [{
      kind: 'chart', ...common, domain: { min: 1800, max: 2600 }, carMeters: car,
      panel: { id: windowId, title: shape.title, unit: shape.unit, series: [series('You', 'Current', shape.live, car), series('Target', 'Comparison', shape.target, Infinity)] },
    }]
  }

  // A made-up line for each On track lap with one: speed dips at five corners, each lap a little
  // faster or slower in each, and elapsed time integrated from it to the lap's own time. Pedals
  // follow the speed (with what the car got: ABS easing the brake, TC the throttle out of the
  // slow corners), steering and gear follow the corners, and the car drives a lumpy loop.
  const sampleTrace = (sessionId, lapNumber) => {
    const lap = [...trainingLaps, ...(state.analysis?.courseLaps ?? [])].find((candidate) => candidate.sessionId === sessionId && candidate.lapNumber === lapNumber)
    if (!lap || !lap.hasChannels) return null
    let seed = [...`${sessionId}/${lapNumber}`].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7)
    const random = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32)
    const corners = [[0.07, 230, 0.012], [0.25, 40, 0.02], [0.47, 175, 0.015], [0.64, 125, 0.03], [0.88, 225, 0.01]]
      .map(([at, depth, width]) => [at, depth * (0.99 + random() * 0.02), width])
    const count = 1000
    const step = 1 / (count - 1)
    const speedKph = Array.from({ length: count }, (_, index) =>
      corners.reduce((speed, [at, depth, width]) => speed - depth * Math.exp(-(((index * step - at) / width) ** 2)), 300))
    const raw = [0]
    for (let index = 1; index < count; index++) raw.push(raw[index - 1] + (step * 6981.6) / (((speedKph[index] + speedKph[index - 1]) / 2) / 3.6))
    const scale = lap.lapTimeSeconds / raw[count - 1]
    const throttle = speedKph.map((speed, index) => (index > 0 && speed < speedKph[index - 1] - 0.4 ? 0 : Math.max(0.2, Math.min(1, 0.35 + (speed - 120) / 120))))
    const brake = speedKph.map((speed, index) => (index > 0 && speed < speedKph[index - 1] - 1.5 ? 0.85 : 0))
    const angle = (index) => 2 * Math.PI * index * step
    // The in-car settings as steps: [[value, from lap fraction], …]. Yours: TC up at C3, brake
    // bias forward after it, ABS down before the last corner. Ada's (a friend's shared lap): TC 5
    // and ABS 3 all lap, migration up after C4. The laps of the Quali session carry none (older).
    const steps = (pairs) => Array.from({ length: count }, (_, index) => pairs.filter(([, from]) => from <= index * step).at(-1)?.[0] ?? pairs[0][0])
    const ada = Boolean(lap.sharedFrom)
    const settings = sessionId === 'sample-spa-quali'
      ? {}
      : {
          tc: steps(ada ? [[5, 0]] : [[3, 0], [5, 0.455]]),
          abs: steps(ada ? [[3, 0]] : [[4, 0], [3, 0.83]]),
          brakeBiasRear: steps(ada ? [[0.466, 0]] : [[0.46, 0], [0.468, 0.6]]),
          migration: steps(ada ? [[2, 0], [4, 0.66]] : [[2, 0]]),
          motorMap: steps([[3, 0]]),
          arbFront: steps([[3, 0]]),
          arbRear: steps([[2, 0]]),
        }
    return {
      version: 2, positionStep: step, trackLengthMeters: 6981.6,
      channels: {
        ...settings,
        speedKph,
        elapsedSeconds: raw.map((value) => value * scale),
        throttle,
        brake,
        throttleApplied: throttle.map((value, index) => (speedKph[index] < 160 && value > 0.3 ? value * (0.7 + 0.3 * Math.abs(Math.sin(index * 1.7))) : value)),
        brakeApplied: brake.map((value, index) => (value > 0 && speedKph[index] < 200 ? value * (0.75 + 0.25 * Math.abs(Math.sin(index * 2.3))) : value)),
        steering: Array.from({ length: count }, (_, index) =>
          corners.reduce((turn, [at, depth, width], corner) => turn + (corner % 2 ? -1 : 1) * (depth / 260) * Math.exp(-(((index * step - at) / (width * 1.6)) ** 2)), 0)),
        gear: speedKph.map((speed) => Math.max(1, Math.min(7, Math.ceil(speed / 44)))),
        worldX: Array.from({ length: count }, (_, index) => 900 * Math.cos(angle(index)) * (1 + 0.22 * Math.sin(2 * angle(index)))),
        worldZ: Array.from({ length: count }, (_, index) => 620 * Math.sin(angle(index)) * (1 + 0.3 * Math.cos(3 * angle(index)))),
      },
    }
  }

  // Setups: a few cars and tracks, named the way setup shops and drivers name the game's files,
  // each with a made-up sheet (`setups=none` for an empty folder, `setups=unavailable` for no
  // game). "Race v3" keeps two older versions, so its page has a version history.
  const setupsMode = params.get('setups')
  const setup = (id, name, car, carClass, trackName, savedAt, session, style, version, versions = 1) => ({
    id, name, track: trackName, trackName, car, carClass, season: 'WEC 2025', savedAt, versions, session, style, version,
  })
  const sampleSetups = setupsMode === 'none' ? [] : [
    setup('race-v3', 'Race v3', 'Porsche 963', 'Hypercar', 'Spa', '2026-10-30T19:12:00Z', 'Race', null, '3', 3),
    setup('race-wet', 'Race wet', 'Porsche 963', 'Hypercar', 'Spa', '2026-10-29T18:40:00Z', 'Race', 'Wet', null),
    setup('quali', 'Quali', 'Porsche 963', 'Hypercar', 'Spa', '2026-10-28T20:05:00Z', 'Quali', null, null),
    setup('ba-963-spa-eq', 'bA2_963_SPA_E_Q_V2_0_0', 'Porsche 963', 'Hypercar', 'Spa', '2026-10-18T12:21:00Z', 'Quali', 'Esport', '2.0.0'),
    setup('ba-963-spa-sr', 'bA2_963_SPA_S_R_V2_0_0', 'Porsche 963', 'Hypercar', 'Spa', '2026-10-18T12:21:00Z', 'Race', 'Safe', '2.0.0'),
    setup('low-drag', 'Low drag', 'Porsche 963', 'Hypercar', 'Monza', '2026-10-12T17:30:00Z', null, null, null, 2),
    setup('quali-low-drag', 'Quali low drag', 'Porsche 963', 'Hypercar', 'Monza', '2026-10-12T17:10:00Z', 'Quali', null, null),
    setup('ba-499-lm-eq', 'bA2_499P_LM_E_Q_V1_1_0', 'Ferrari 499P', 'Hypercar', 'Le Mans', '2026-10-05T09:00:00Z', 'Quali', 'Esport', '1.1.0'),
    setup('ba-499-lm-er', 'bA2_499P_LM_E_R_V1_1_0', 'Ferrari 499P', 'Hypercar', 'Le Mans', '2026-10-05T09:00:00Z', 'Race', 'Esport', '1.1.0'),
    setup('ba-499-lm-wr', 'bA2_499P_LM_W_R_V1_1_0', 'Ferrari 499P', 'Hypercar', 'Le Mans', '2026-10-05T09:00:00Z', 'Race', 'Wet', '1.1.0'),
    setup('m4-spa-race', 'Sprint race', 'BMW M4 LMGT3', 'GT3', 'Spa', '2026-09-21T16:00:00Z', 'Race', null, null),
    setup('m4-spa-safe', 'bA_M4_SPA_S_R06', 'BMW M4 LMGT3', 'GT3', 'Spa', '2026-09-14T11:00:00Z', 'Race', 'Safe', '6'),
  ]
  // Analysis: the sample practice session in three runs (out of the garage and back), with the
  // tyres and fuel the recorder keeps per lap; "Race v3" is on run 1 and "Quali" on run 3, run 2
  // has none yet. How those setups drove is in setupDriven below.
  if (state.analysis?.session?.id === 'sample-spa-practice' && Array.isArray(state.analysis.laps)) {
    const outingOf = (lapNumber) => (lapNumber <= 4 ? 1 : lapNumber <= 7 ? 2 : 3)
    const start = Date.parse('2026-09-28T18:04:00Z')
    state.analysis.laps = state.analysis.laps.map((lap) => ({
      ...lap,
      detail: 'Practice · 18:02',
      // Every lap has a made-up line but lap 4, so compare opens and one lap shows "Time only".
      tier: lap.lapNumber === 4 ? 'TimeOnly' : 'FullTrace',
      hasChannels: lap.lapNumber !== 4,
      unavailableReason: lap.lapNumber === 4 ? lap.unavailableReason : null,
      outing: outingOf(lap.lapNumber),
      frontCompound: outingOf(lap.lapNumber) === 2 ? 'Soft' : 'Medium',
      rearCompound: 'Medium',
      fuelUsedLiters: lap.lapNumber === 1 ? null : 3 + ((lap.lapNumber * 7) % 15) / 100,
      completedAt: new Date(start + lap.lapNumber * 140_000 + (outingOf(lap.lapNumber) - 1) * 360_000).toISOString(),
      // Lap 1 carries two of your notes (at C3, and where the bias went forward).
      notes: lap.lapNumber === 1
        ? [
            { id: 'note-c3', distanceMeters: 3190, text: 'Lift earlier into C3, the car rotates better with TC 5', author: 'Luca', createdAt: '2026-09-28T19:30:00Z', mine: true },
            { id: 'note-bias', distanceMeters: 4250, text: 'Bias forward helps the stop into C4', author: 'Luca', createdAt: '2026-09-28T19:31:00Z', mine: true },
          ]
        : [],
    }))
    const picked = { 1: { snapshotId: 'race-v3@0', name: 'Race v3', setupId: 'race-v3' }, 3: { snapshotId: 'quali@0', name: 'Quali', setupId: 'quali' } }
    state.analysis.runs = [1, 2, 3].map((outing, index) => {
      const laps = state.analysis.laps.filter((lap) => lap.outing === outing)
      const began = Math.min(...laps.map((lap) => Date.parse(lap.completedAt) - lap.lapTimeSeconds * 1000))
      return {
        outing,
        number: index + 1,
        laps: laps.length,
        bestLapSeconds: Math.min(...laps.map((lap) => lap.lapTimeSeconds)),
        startedAt: new Date(began).toISOString(),
        setup: picked[outing] ?? null,
      }
    })
  }

  // The sessions list: the sample's sessions with their runs, plus a GT3 one, an imported race
  // with times only and a friend's shared lap, so the list has groups, tags and a faster friend.
  // `analysis=list` shows it instead of the open session. The open session's course laps add
  // the quali (your best here) and Ada's lap, for "your best here" and compare's pickers.
  if (state.analysis) {
    const base = state.analysis.filter?.sessions ?? []
    const runsOf = { 'sample-spa-practice': 3, 'sample-spa-quali': 1, 'sample-monza-race': 1, 'sample-lemans-practice': 2 }
    const spaContext = base.find((entry) => entry.id === 'sample-spa-practice')?.context
    const extra = spaContext
      ? [
          { ...base[0], id: 'sample-spa-race', kind: 'Race', origin: 'Imported', startedAt: '2026-09-27T19:30:00+00:00', lapCount: 28, tracedLapCount: 0, bestLapSeconds: 126.112, day: '2026-09-27', label: 'Race · 19:30' },
          { ...base[0], id: 'sample-ada', kind: 'Practice', origin: 'Shared', startedAt: '2026-09-25T12:00:00+00:00', lapCount: 1, tracedLapCount: 1, bestLapSeconds: 124.38, sharedFrom: 'Ada Brandt', day: '2026-09-25', label: 'Shared by Ada Brandt' },
          { ...base[0], id: 'sample-m4-spa', context: { ...spaContext, carModel: 'BMW M4 LMGT3', carClass: 'GT3' }, startedAt: '2026-09-26T20:15:00+00:00', lapCount: 12, tracedLapCount: 12, bestLapSeconds: 138.402, day: '2026-09-26', label: 'Practice · 20:15' },
        ]
      : []
    state.analysis.sessions = [...base, ...extra]
      .map((entry) => ({ ...entry, runs: entry.sharedFrom || entry.origin === 'Imported' ? 0 : (runsOf[entry.id] ?? 2) }))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    const session = state.analysis.session
    if (params.get('analysis') === 'list') {
      state.analysis.session = null
      state.analysis.laps = []
      state.analysis.runs = []
      state.analysis.courseLaps = []
    } else if (session?.id === 'sample-spa-practice') {
      const lapOf = (sessionId, lapNumber, lapTimeSeconds, sharedFrom = null) => ({
        ...state.analysis.laps[0], sessionId, lapNumber, label: `Lap ${lapNumber}`, lapTimeSeconds, tier: 'FullTrace', hasChannels: true,
        detail: sharedFrom ? `Shared by ${sharedFrom} · 12:00` : 'Qualify · 19:10',
        unavailableReason: null, sharedFrom, traceId: `${sessionId}/${lapNumber}`, outing: 1, sessionStartedAt: sharedFrom ? '2026-09-25T12:00:00+00:00' : '2026-09-28T19:10:00+00:00',
        // Ada's lap came with her notes, read-only here.
        notes: sharedFrom
          ? [
              { id: 'ada-c1', distanceMeters: 480, text: 'Brake at the 100 board, not before', author: sharedFrom, createdAt: '2026-09-25T12:10:00Z', mine: false },
              { id: 'ada-c3', distanceMeters: 3180, text: 'TC 5 from here: the rear steps out on exit', author: sharedFrom, createdAt: '2026-09-25T12:11:00Z', mine: false },
            ]
          : [],
      })
      state.analysis.courseLaps = [
        ...state.analysis.laps,
        lapOf('sample-spa-quali', 3, 124.501),
        lapOf('sample-spa-quali', 2, 124.877),
        lapOf('sample-ada', 1, 124.38, 'Ada Brandt'),
      ].sort((a, b) => a.lapTimeSeconds - b.lapTimeSeconds)
    }
  }

  // The host names cars by what they are, with the game's model beside it: the sample's older
  // model-named contexts get that shape here.
  if (state.analysis) {
    const names = { 'Porsche 963': 'Hypercar Porsche', 'BMW M4 LMGT3': 'LMGT3 BMW', 'Ferrari 499P': 'Hypercar Ferrari', 'Oreca 07': 'LMP2 ELMS' }
    const named = (entry) =>
      entry?.context && names[entry.context.carModel]
        ? { ...entry, context: { ...entry.context, carModel: names[entry.context.carModel], carType: entry.context.carModel, livery: null } }
        : entry
    state.analysis.sessions = state.analysis.sessions.map(named)
    state.analysis.laps = (state.analysis.laps ?? []).map(named)
    state.analysis.courseLaps = (state.analysis.courseLaps ?? []).map(named)
    state.analysis.session = named(state.analysis.session)
  }

  // What one sheet holds: [tab, group, label, base step, the display a step reads as].
  const deg = (step) => `${(-2.5 + step * 0.1).toFixed(1)} deg`
  const SHEET = [
    ['Power', 'Fuel and energy', 'Fuel', 0, () => '17.0L (5.1 laps)'],
    ['Power', 'Fuel and energy', 'Virtual energy', 100, (step) => `${step}% (25.8 laps)`],
    ['Power', 'Electronics', 'TC map', 7, (step) => `${step}`],
    ['Power', 'Electronics', 'TC power cut', 6, (step) => `${step}`],
    ['Power', 'Hybrid', 'Regen level', 10, (step) => `${step * 17}kW`],
    ['Power', 'Differential', 'Power', 4, (step) => `${step * 5 + 10}%`],
    ['Power', 'Differential', 'Coast', 10, (step) => `${step * 5 + 10}%`],
    ['Power', 'Gearbox', 'Gear set', 0, (step) => (step > 0 ? 'Long' : 'Short')],
    ['WheelsAndBrakes', 'Brakes', 'Brake bias', 18, (step) => `${(60 - step * 0.45).toFixed(1)}:${(40 + step * 0.45).toFixed(1)}`],
    ['WheelsAndBrakes', 'Brakes', 'Brake migration', 0, (step) => `${(2.5 + step * 0.5).toFixed(1)}% F`],
    ['WheelsAndBrakes', 'Brakes', 'Brake pressure', 80, () => '120 kgf (100%)'],
    ['ChassisAndAero', 'Aero', 'Rear wing', 11, (step) => `P${step + 1}`],
    ['ChassisAndAero', 'Cooling', 'Water radiator', 4, (step) => `${step * 25}%`],
    ['ChassisAndAero', 'Cooling', 'Front brake ducts', 0, (step) => (step > 0 ? `${step * 25}% closed` : 'Open')],
    ['ChassisAndAero', 'Steering', 'Steering lock', 0, () => '527 (20) deg'],
    ['Suspension', 'Front', 'Anti-roll bar', 1, (step) => `P${step}`],
    ['Suspension', 'Rear', 'Anti-roll bar', 4, (step) => `P${step}`],
    ['Suspension', 'Front', 'Third spring', 1, (step) => `${step}`],
    ['Suspension', 'Rear', 'Third spring', 12, (step) => `${step}`],
    ['Dampers', 'Front', 'Third slow bump', 5, (step) => `${step + 1}`],
    ['Dampers', 'Rear', 'Third slow bump', 3, (step) => `${step + 1}`],
    ...['Front left', 'Front right', 'Rear left', 'Rear right'].flatMap((corner) => [
      ['Suspension', corner, 'Camber', corner.startsWith('Front') ? 15 : 10, deg],
      ['Suspension', corner, 'Spring', 3, (step) => `${step + 1}`],
      ['Suspension', corner, 'Ride height', corner.startsWith('Front') ? 0 : 5, (step) => `${(4 + step * 0.5).toFixed(1)} cm`],
      ['WheelsAndBrakes', corner, 'Tyre pressure', 0, (step) => `${131 + step} kPa`],
      ['WheelsAndBrakes', corner, 'Compound', 0, () => 'Medium'],
      ['Dampers', corner, 'Slow bump', 6, (step) => `${step + 1}`],
      ['Dampers', corner, 'Fast bump', 1, (step) => `${step + 1}`],
      ['Dampers', corner, 'Slow rebound', 2, (step) => `${step + 1}`],
      ['Dampers', corner, 'Fast rebound', 3, (step) => `${step + 1}`],
    ]),
  ]
  const sampleSheet = (id, version) => {
    const item = sampleSetups.find((candidate) => candidate.id === id)
    if (!item) return null
    const versions = Array.from({ length: item.versions }, (_, index) => ({
      id: `${id}@${index}`,
      savedAt: new Date(Date.parse(item.savedAt) - index * 86_400_000).toISOString(),
      isCurrent: index === 0,
    }))
    const shown = version ? versions.find((candidate) => candidate.id === version) : versions[0]
    if (!shown) return null
    let seed = [...shown.id].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7)
    const random = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32)
    // Each setup moves about a third of its values a step or two off the base; the right-hand
    // corner usually follows the left one, so most axles read as one value.
    const offsets = new Map()
    const readings = SHEET.map(([tab, group, label, base, display]) => {
      const pair = `${tab}/${group.replace(/ (left|right)$/, '')}/${label}`
      const offset = group.endsWith('right') && offsets.has(pair) && random() < 0.9 ? offsets.get(pair) : random() < 0.35 ? Math.round(random() * 4 - 2) : 0
      offsets.set(pair, offset)
      const step = Math.max(0, base + offset)
      return { section: group.toUpperCase(), key: label, tab, group, label, display: display(step), step }
    })
    return { setup: item, versionId: shown.id, readings, versions }
  }

  window.sprint = {
    getState: async () => state,
    sendCommand: async (command) => {
      console.info('[preview] command', command)
      return null
    },
    subscribe: () => () => undefined,
    analysisTrace: async (sessionId, lapNumber) => sampleTrace(sessionId, lapNumber),
    setups: async () => (setupsMode === 'unavailable' ? { available: false, folder: null, setups: [] } : { available: true, folder: 'C:\\Games\\Le Mans Ultimate\\UserData\\player\\Settings', setups: sampleSetups }),
    setupSheet: async (id, version) => sampleSheet(id, version),
    // How each version drove: "Race v3" on runs in two sessions (its older version too), "Quali" on one.
    setupDriven: async (id) => {
      const item = sampleSetups.find((candidate) => candidate.id === id)
      if (!item) return null
      const driven = {
        'race-v3@0': { laps: 4, sessions: 1, bestLapSeconds: 125.4, medianLapSeconds: 125.817, fuelPerLapLiters: 3.11, tyres: [{ front: 'Medium', rear: 'Medium', laps: 4 }] },
        'race-v3@1': { laps: 9, sessions: 2, bestLapSeconds: 125.263, medianLapSeconds: 125.64, fuelPerLapLiters: 3.09, tyres: [{ front: 'Medium', rear: 'Medium', laps: 6 }, { front: 'Soft', rear: 'Medium', laps: 3 }] },
        'quali@0': { laps: 2, sessions: 1, bestLapSeconds: 126.204, medianLapSeconds: 126.204, fuelPerLapLiters: 3.05, tyres: [{ front: 'Medium', rear: 'Medium', laps: 2 }] },
      }
      const none = { laps: 0, sessions: 0, bestLapSeconds: null, medianLapSeconds: null, fuelPerLapLiters: null, tyres: [] }
      return Array.from({ length: item.versions }, (_, index) => ({ versionId: `${id}@${index}`, ...(driven[`${id}@${index}`] ?? none) }))
    },
    diagnosticsLogs: async () => null,
    // A plan's target choices, resolved over the payload's own lap history the way the host's
    // PlanTargetResolver does: per session kind, the fastest/median/slowest valid lap and every lap.
    planTargets: async (planId) => {
      const plan = (state.plans ?? []).find((candidate) => candidate.id === planId)
      if (!plan) return { scopes: [] }
      const sessions = (state.lapHistory ?? []).filter((session) => session.context?.trackCourse === plan.track && session.context?.carModel === plan.car)
      const scopeOf = { Practice: 'Practice', Qualifying: 'Qualifying' }
      const scopes = ['Qualifying', 'Practice'].flatMap((kind) => {
        const laps = sessions
          .filter((session) => session.kind === kind)
          .flatMap((session) => (session.laps ?? []).filter((lap) => lap.isValid).map((lap) => ({ session, lap })))
          .sort((a, b) => a.lap.lapTimeSeconds - b.lap.lapTimeSeconds)
        if (laps.length === 0) return []
        const option = ({ session, lap }, statistic) => ({
          scope: scopeOf[kind], programType: null, statistic, lapTimeSeconds: lap.lapTimeSeconds, sampleSize: laps.length,
          lapSessionId: session.id, lapNumber: lap.lapNumber, lapSessionStartedAt: session.startedAt, tierNote: 'time only',
        })
        const median = laps[Math.floor((laps.length - 1) / 2)]
        return [{
          scope: scopeOf[kind], programType: null, label: kind, sampleSize: laps.length,
          options: [option(laps[0], 'Fastest'), option(median, 'Median'), option(laps[laps.length - 1], 'Slowest')],
          laps: laps.map((entry) => option(entry, 'Custom')),
        }]
      })
      return { scopes }
    },
    // The New plan dialog's choices, derived from the payload's own lap history the way the
    // host derives them (distinct, sorted; per game), prefilled from the remembered context.
    planContext: async () => {
      const contexts = (state.lapHistory ?? []).map((session) => session.context ?? {})
      const distinct = (values) => [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))].sort((a, b) => a.localeCompare(b))
      const games = distinct(contexts.map((context) => context.game))
      const seen = state.settings?.lastSeenContext ?? {}
      return {
        prefill: { game: seen.game ?? '', car: seen.car ?? '', track: seen.track ?? '' },
        games,
        tracks: distinct(contexts.map((context) => context.trackCourse)),
        cars: distinct(contexts.map((context) => context.carModel)),
        byGame: games.map((game) => {
          const own = contexts.filter((context) => context.game === game)
          return { game, tracks: distinct(own.map((context) => context.trackCourse)), cars: distinct(own.map((context) => context.carModel)) }
        }),
      }
    },
    resultsImportScan: async (includeDeclined) =>
      (params.get('import') === 'offer' || firstRun !== null) && !includeDeclined
        ? {
            entries: ['practice-1.xml', 'practice-2.xml', 'quali.xml', 'race.xml'],
            counts: [
              { kind: 'Practice', count: 2 },
              { kind: 'Qualifying', count: 1 },
              { kind: 'Race', count: 1 },
            ],
          }
        : { entries: [], counts: [] },
    resultsImport: async (entries) => ({ outcome: 'Imported', importedCount: entries.length }),
    resultsImportDecline: async () => null,
    checkUpdates: async () =>
      params.get('update') === '1'
        ? { updateAvailable: true, latest: { version: '0.2.0', channel: 'stable', url: 'https://example.invalid/release' } }
        : { updateAvailable: false },
    installUpdate: async () => ({ outcome: 'unavailable-in-dev' }),
    // Any password signs in except "wrong", which shows the error.
    signIn: async (serverUrl, email, password) =>
      password === 'wrong' ? { ok: false, error: 'Invalid credentials.' } : { ok: true },
    signInWithDiscord: () =>
      discord === 'fail'
        ? Promise.resolve({ outcome: 'Failed', error: 'Registration is closed on this server.' })
        : new Promise((resolve) => {
            pendingDiscord = resolve
          }),
    cancelDiscordSignIn: async () => {
      pendingDiscord?.({ outcome: 'Cancelled', error: '' })
      pendingDiscord = null
    },
    serverInfo: async () => ({ reachable: true, instanceName: 'Sprint', allowRegistration: true, discordSignIn: discord === '1' || discord === 'fail' }),
    signOut: async () => null,
    // Long enough for the scan bar to show; a real sweep takes a few seconds.
    discoverServers: () =>
      new Promise((resolve) =>
        setTimeout(() => resolve({ servers: params.get('servers') === 'none' ? [] : [{ url: 'http://192.168.1.20:8080', version: '0.1.0' }] }), 1200),
      ),
    syncUp: async () => syncReport(14, 0),
    syncDown: async () => syncReport(0, 3),
    subscribeHud: (listener) => {
      const windowId = params.get('hud')
      if (windowId) hudMessages(windowId, params.get('hudArranging') === '1').forEach((message, index) => setTimeout(() => listener(message), index * 30))
      return () => undefined
    },
    resizeHud: () => undefined,
    openDashDesigner: async (dashId) => {
      console.info('[preview] open dash designer', dashId)
      return null
    },
  }

  // Pages are reached through the app's own input paths, so the preview adds
  // nothing to production code: Alt+1..8 (⌘1..8 with platform=mac) for the
  // primary pages (shell/nav.ts order), a click on the pane item for the footer pages, and a
  // click on its tab for a page that shares a row (Live link is a tab of Race engineer).
  const primaryOrder = ['Home', 'SessionPlanner', 'OnTrack', 'Analysis', 'Setups', 'Dashes', 'Devices', 'RaceEngineer']
  const tabbed = { LiveLink: { host: 'RaceEngineer', tab: 'Live link' } }
  const footerLabels = { Settings: 'Settings', Help: 'Help & diagnostics' }
  // The modifier the shell listens for (shell/shortcuts.ts): Command on mac, Alt/Ctrl elsewhere.
  const mac = params.get('platform') === 'mac'

  const openView = (view) => {
    const shared = tabbed[view]
    if (shared) {
      openView(shared.host)
      setTimeout(() => {
        const tab = [...document.querySelectorAll('[role="tab"]')].find((element) => element.textContent?.trim() === shared.tab)
        if (tab instanceof HTMLElement) tab.click()
        else console.warn(`[preview] no "${shared.tab}" tab`)
      }, 100)
      return
    }
    const index = primaryOrder.indexOf(view)
    if (index >= 0) {
      window.dispatchEvent(new KeyboardEvent('keydown', { [mac ? 'metaKey' : 'altKey']: true, code: `Digit${index + 1}`, key: String(index + 1), bubbles: true }))
      return
    }
    const label = footerLabels[view]
    const item = [...document.querySelectorAll('.nav-item')].find((element) => element.textContent?.trim() === label)
    if (item instanceof HTMLElement) item.click()
    else console.warn(`[preview] unknown view "${view}"`)
  }

  const whenShellReady = (run) => {
    const timer = setInterval(() => {
      // The app shell, a designer window (designer=<dashId>) or the first-run setup, once its state has loaded.
      if (!document.querySelector('.app.ready, .designer.ready, .first-run')) return
      clearInterval(timer)
      run()
    }, 20)
  }

  // Clicks each `click=` selector in order, each once it exists (or gives up on it after 2s),
  // so a screenshot can show a state that needs input: a selected row, an open dialog, a tab.
  const clickInOrder = (selectors) => {
    const [step, ...rest] = selectors
    if (!step) return
    // `selector@0.46`: a click that far across the element, e.g. a place along a chart's SVG.
    const at = /^(.*)@(\d*\.?\d+)$/.exec(step)
    const selector = at ? at[1] : step
    const across = at ? Number(at[2]) : null
    const started = Date.now()
    const timer = setInterval(() => {
      // Any element (an SVG too), not only an HTMLElement.
      const element = document.querySelector(selector)
      if (!element && Date.now() - started < 2000) return
      clearInterval(timer)
      if (!element) console.warn(`[preview] nothing matches click selector "${selector}"`)
      else if (across === null && element instanceof HTMLElement) element.click()
      else {
        const box = element.getBoundingClientRect()
        element.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: box.left + box.width * (across ?? 0.5), clientY: box.top + box.height / 2 }))
      }
      setTimeout(() => clickInOrder(rest), 50)
    }, 20)
  }

  // Focuses the `focus=` selector once the clicks are done and it exists, for what only focus or
  // hover shows: a chart's tooltip, a row's ⋯ button.
  const focusLater = (selector) => {
    if (!selector) return
    const started = Date.now()
    const timer = setInterval(() => {
      const element = document.querySelector(selector)
      if (!(element instanceof HTMLElement) && Date.now() - started < 2500) return
      clearInterval(timer)
      if (element instanceof HTMLElement) {
        element.focus()
        element.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
      } else console.warn(`[preview] nothing matches focus selector "${selector}"`)
    }, 20)
  }

  whenShellReady(() => {
    const view = params.get('view')
    if (view && view !== 'Home') openView(view)
    if (params.get('palette') === '1') {
      window.dispatchEvent(new KeyboardEvent('keydown', { [mac ? 'metaKey' : 'ctrlKey']: true, key: 'k', code: 'KeyK', bubbles: true }))
    }
    clickInOrder(params.getAll('click'))
    setTimeout(() => focusLater(params.get('focus')), 50 * (params.getAll('click').length + 1))
  })
})()
