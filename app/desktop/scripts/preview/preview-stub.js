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
//   telemetry=unsupported the Windows-only LMU source as a Mac reports it (Windows look: Home InfoBar; Mac look: toolbar indicator)
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
//                         repeat the parameter to click several things in order
//   training=on|none      On track: the HUD is showing (on), or no lap has ever been recorded (none);
//                         default: laps listed, the fastest picked, HUD off. fullscreen=1 adds the warning
//   hud=<windowId>        mount one training HUD window instead of the app: delta, throttle, brake, speed;
//                         hudLocked=0 shows it unlocked (outline and grip). Screenshot it at its window size
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
  // telemetry=unsupported: what a Mac reports: the LMU source is Windows-only. The Windows look shows the Home InfoBar; the Mac look shows only the toolbar indicator.
  if (params.get('telemetry') === 'unsupported' && state.telemetry) {
    state.telemetry = {
      ...state.telemetry,
      frame: null,
      status: { ...state.telemetry.status, state: 'Unsupported', detail: 'The LMU_Data shared-memory provider is only supported on Windows.', lastFrameValid: false, isLive: false },
    }
  }
  // Payloads captured before the results import existed carry no `resultsImport`; preview as LMU does.
  state.resultsImport ??= { available: true, sourceName: 'the Le Mans Ultimate results folder' }
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
    lapOn('shared-ada', 3, 124.88, '2026-10-02T19:10:00+00:00', 'FullTrace', 'Ada'),
    lapOn('spa-0928', 5, 125.263, '2026-09-28T18:02:00+00:00', 'FullTrace'),
    lapOn('spa-0928', 1, 125.4, '2026-09-28T18:02:00+00:00', 'FullTrace'),
    lapOn('spa-0928', 4, 125.912, '2026-09-28T18:02:00+00:00', 'FullTrace'),
    lapOn('spa-0920', 3, 126.031, '2026-09-20T17:40:00+00:00', 'TimeOnly'),
  ]
  state.compare =
    training === 'none'
      ? { courses: [], course: null, laps: [], lapCount: 0, target: null, hudOpen: false, fullscreen: false }
      : {
          courses: [spa, { game: 'LeMansUltimate', trackCourse: 'Autodromo Nazionale Monza', carModel: 'Porsche 963' }],
          course: spa,
          laps: trainingLaps,
          lapCount: 42,
          target: { sessionId: 'spa-0928', lapNumber: 5, label: '2:05.3 · Lap 5, Sep 28', lapTimeSeconds: 125.263 },
          hudOpen: training === 'on',
          fullscreen: params.get('fullscreen') === '1',
        }
  state.settings = { ...state.settings, liveCompare: { version: 3, panelIds: ['throttle', 'brake', 'speed'], showDelta: true, locked: training === 'on', layouts: [] } }

  // One HUD window's message (electron/hudFeed.ts): a braking zone 250 m ahead of the car.
  const hudMessage = (windowId, locked) => {
    if (windowId === 'delta') return { kind: 'delta', locked, targetName: '2:05.3 · Lap 5, Sep 28', deltaSeconds: -0.214 }
    const car = 2000
    const xs = Array.from({ length: 161 }, (_, index) => 1800 + index * 5)
    const shapes = {
      throttle: { title: 'Throttle', unit: '%', target: (x) => (x > 2220 && x < 2380 ? 0 : x >= 2380 && x < 2430 ? (x - 2380) * 2 : 100), live: () => 100 },
      brake: { title: 'Brake', unit: '%', target: (x) => (x > 2230 && x < 2330 ? Math.max(30, 100 - (x - 2245) * 0.8) : 0), live: () => 0 },
      speed: { title: 'Speed', unit: 'km/h', target: (x) => (x < 2230 ? 285 : x < 2330 ? 285 - (x - 2230) * 1.4 : 145 + (x - 2330) * 0.25), live: (x) => 281 + (x - 1800) * 0.01 },
    }
    const shape = shapes[windowId]
    if (!shape) return { kind: 'chart', locked, panel: null, domain: null, carMeters: null }
    const series = (name, role, f, upTo) => ({
      name, role, interpolation: 'Linear', fillArea: false,
      samples: xs.filter((x) => x <= upTo).map((x) => ({ x, y: f(x) })),
    })
    return {
      kind: 'chart', locked, domain: { min: 1800, max: 2600 }, carMeters: car,
      panel: { id: windowId, title: shape.title, unit: shape.unit, series: [series('You', 'Current', shape.live, car), series('Target', 'Comparison', shape.target, Infinity)] },
    }
  }

  window.sprint = {
    getState: async () => state,
    sendCommand: async (command) => {
      console.info('[preview] command', command)
      return null
    },
    subscribe: () => () => undefined,
    analysisTrace: async () => null,
    diagnosticsLogs: async () => null,
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
      params.get('import') === 'offer' && !includeDeclined
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
      if (windowId) setTimeout(() => listener(hudMessage(windowId, params.get('hudLocked') !== '0')), 0)
      return () => undefined
    },
    resizeHud: () => undefined,
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
      if (!document.querySelector('.app.ready')) return
      clearInterval(timer)
      run()
    }, 20)
  }

  // Clicks each `click=` selector in order, each once it exists (or gives up on it after 2s),
  // so a screenshot can show a state that needs input: a selected row, an open dialog, a tab.
  const clickInOrder = (selectors) => {
    const [selector, ...rest] = selectors
    if (!selector) return
    const started = Date.now()
    const timer = setInterval(() => {
      const element = document.querySelector(selector)
      if (!(element instanceof HTMLElement) && Date.now() - started < 2000) return
      clearInterval(timer)
      if (element instanceof HTMLElement) element.click()
      else console.warn(`[preview] nothing matches click selector "${selector}"`)
      setTimeout(() => clickInOrder(rest), 50)
    }, 20)
  }

  whenShellReady(() => {
    const view = params.get('view')
    if (view && view !== 'Home') openView(view)
    if (params.get('palette') === '1') {
      window.dispatchEvent(new KeyboardEvent('keydown', { [mac ? 'metaKey' : 'ctrlKey']: true, key: 'k', code: 'KeyK', bubbles: true }))
    }
    clickInOrder(params.getAll('click'))
  })
})()
