import type { CloudServerChoice, CloudStorageMode, DiscoveredServer } from '../bridge'

/**
 * The Sprint web setup as a pure state machine: which step shows, what each answer leads to,
 * and where Back goes. The view (Onboarding.tsx) renders `current`, runs the step's I/O
 * (scanning, signing in, uploading) and feeds the outcome back in as an event.
 *
 *   welcome → server ─┬─ this PC only ─────────────────────────────→ done
 *                     ├─ official ──────────────→ account → storage ─┬→ transfer → done
 *                     └─ self-hosted → discover → address ↗          └→ done
 */
export type Step =
  | { step: 'welcome' }
  | { step: 'server' }
  | { step: 'discover' }
  | { step: 'address'; found: DiscoveredServer[]; url: string }
  | { step: 'account'; server: 'Official' | 'SelfHosted'; serverUrl: string }
  | { step: 'storage'; server: 'Official' | 'SelfHosted' }
  | { step: 'transfer'; server: 'Official' | 'SelfHosted'; storage: 'Both' | 'Remote' }
  | { step: 'done'; server: CloudServerChoice; storage: CloudStorageMode }

export type FlowEvent =
  | { type: 'start' }
  | { type: 'chooseLocalOnly' }
  | { type: 'chooseOfficial'; url: string }
  | { type: 'chooseSelfHosted' }
  | { type: 'discovered'; servers: DiscoveredServer[] }
  | { type: 'useAddress'; url: string }
  | { type: 'rescan' }
  | { type: 'signedIn' }
  | { type: 'chooseStorage'; storage: CloudStorageMode; localItems: number }
  | { type: 'transferDone' }

/** `direction` is which way the last move went, so the panel slides the right way. */
export type Flow = { current: Step; history: Step[]; direction: 'forward' | 'back'; rememberedUrl: string }

/**
 * A first launch opens on the welcome; connecting later (Settings, the sidebar's Sign in)
 * starts at the server choice. `rememberedUrl` is the last server used, offered when the
 * network scan finds nothing.
 */
export const begin = (entry: 'first-run' | 'connect', rememberedUrl = ''): Flow => ({
  current: entry === 'first-run' ? { step: 'welcome' } : { step: 'server' },
  history: [],
  direction: 'forward',
  rememberedUrl,
})

const advance = (flow: Flow, step: Step): Flow => ({
  ...flow,
  // The scan is a moment, not a place: Back from the address goes to the server choice.
  history: flow.current.step === 'discover' ? flow.history : [...flow.history, flow.current],
  current: step,
  direction: 'forward',
})

/** The step an answer leads to. An event that does not belong to the current step changes nothing. */
export function next(flow: Flow, event: FlowEvent): Flow {
  const current = flow.current
  switch (event.type) {
    case 'start':
      return current.step === 'welcome' ? advance(flow, { step: 'server' }) : flow
    case 'chooseLocalOnly':
      return current.step === 'server' ? advance(flow, { step: 'done', server: 'None', storage: 'Local' }) : flow
    case 'chooseOfficial':
      return current.step === 'server' ? advance(flow, { step: 'account', server: 'Official', serverUrl: event.url }) : flow
    case 'chooseSelfHosted':
      return current.step === 'server' ? advance(flow, { step: 'discover' }) : flow
    case 'discovered':
      return current.step === 'discover'
        ? advance(flow, { step: 'address', found: event.servers, url: event.servers[0]?.url ?? flow.rememberedUrl })
        : flow
    case 'rescan':
      // Replaces the address step rather than stacking on it, so Back still means "the choice before".
      return current.step === 'address' ? { ...flow, current: { step: 'discover' }, direction: 'forward' } : flow
    case 'useAddress':
      return current.step === 'address' ? advance(flow, { step: 'account', server: 'SelfHosted', serverUrl: event.url }) : flow
    case 'signedIn':
      return current.step === 'account' ? advance(flow, { step: 'storage', server: current.server }) : flow
    case 'chooseStorage':
      if (current.step !== 'storage') return flow
      return event.storage !== 'Local' && event.localItems > 0
        ? advance(flow, { step: 'transfer', server: current.server, storage: event.storage })
        : advance(flow, { step: 'done', server: current.server, storage: event.storage })
    case 'transferDone':
      return current.step === 'transfer' ? advance(flow, { step: 'done', server: current.server, storage: current.storage }) : flow
  }
}

/** Steps back one answer. At the first step it stays put. */
export function back(flow: Flow): Flow {
  const previous = flow.history[flow.history.length - 1]
  return previous ? { ...flow, current: previous, history: flow.history.slice(0, -1), direction: 'back' } : flow
}
