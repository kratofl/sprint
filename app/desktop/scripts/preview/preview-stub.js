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
//   click=<css selector>  after the view opens, click the first match (waits up to 2s for it);
//                         repeat the parameter to click several things in order
;(() => {
  const params = new URLSearchParams(window.location.search)

  const theme = params.get('theme')
  if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme

  const state = structuredClone(window.__SPRINT_PREVIEW_STATE__ ?? {})
  if (params.get('collapsed') === '1') state.settings = { ...state.settings, sidebarCollapsed: true }
  if (params.get('frame') === 'none' && state.telemetry) state.telemetry = { ...state.telemetry, frame: null }
  // Payloads captured before the results import existed carry no `resultsImport`; preview as LMU does.
  state.resultsImport ??= { available: true, sourceName: 'the Le Mans Ultimate results folder' }

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
  }

  // Pages are reached through the app's own input paths, so the preview adds
  // nothing to production code: Alt+1..7 for the primary pages (shell/nav.ts
  // order), a click on the pane item for the footer pages.
  const primaryOrder = ['Home', 'SessionPlanner', 'Analysis', 'Dashes', 'Devices', 'Setups', 'RaceEngineer']
  const footerLabels = { Settings: 'Settings', Help: 'Help & diagnostics' }

  const openView = (view) => {
    const index = primaryOrder.indexOf(view)
    if (index >= 0) {
      window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true, code: `Digit${index + 1}`, key: String(index + 1), bubbles: true }))
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
      window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: 'k', code: 'KeyK', bubbles: true }))
    }
    clickInOrder(params.getAll('click'))
  })
})()
