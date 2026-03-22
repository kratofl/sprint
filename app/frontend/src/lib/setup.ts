// ── Types ─────────────────────────────────────────────────────────────────────

export interface SetupSettings {
  // Tyres
  tyrePressureFL: number    // kPa
  tyrePressureFR: number
  tyrePressureRL: number
  tyrePressureRR: number
  tyreCompound: 'Soft' | 'Medium' | 'Hard' | 'Wet'
  // Aero
  frontWing: number         // 0–100
  rearWing: number          // 0–100
  // Suspension
  rideHeightFront: number   // mm
  rideHeightRear: number    // mm
  // Differential
  diffPreload: number       // Nm
  diffPower: number         // % lock
  diffCoast: number         // % lock
  // Brakes
  brakeBias: number         // % front (50–65)
  brakePressure: number     // % of max (70–100)
}

export interface Setup {
  id: string
  name: string
  car: string
  track: string
  settings: SetupSettings
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export function defaultSettings(): SetupSettings {
  return {
    tyrePressureFL: 190,
    tyrePressureFR: 190,
    tyrePressureRL: 185,
    tyrePressureRR: 185,
    tyreCompound: 'Medium',
    frontWing: 50,
    rearWing: 60,
    rideHeightFront: 70,
    rideHeightRear: 75,
    diffPreload: 80,
    diffPower: 50,
    diffCoast: 30,
    brakeBias: 57,
    brakePressure: 90,
  }
}

export function newSetup(overrides?: Partial<Omit<Setup, 'settings'>>): Setup {
  return {
    id: '',
    name: '',
    car: '',
    track: '',
    settings: defaultSettings(),
    ...overrides,
  }
}

// ── Wails Go binding helpers ───────────────────────────────────────────────────
// Wails injects window.go.main.App at runtime. We call it directly rather than
// importing the generated wailsjs/ bundle, so Vite doesn't try to bundle the
// Wails runtime (which is injected by the native shell, not npm).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const goApp = (): Record<string, (...args: unknown[]) => Promise<unknown>> | null => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  return w?.go?.main?.App ?? null
}

function call<T>(method: string, ...args: unknown[]): Promise<T> {
  const app = goApp()
  if (!app || typeof app[method] !== 'function') {
    return Promise.reject(new Error(`Wails binding not available: App.${method}. Run inside the desktop app.`))
  }
  return app[method](...args) as Promise<T>
}

// ── Raw Wails response type ───────────────────────────────────────────────────

interface RawSetup {
  id: string
  name: string
  car: string
  track: string
  settings: Record<string, unknown>
}

// ── API ───────────────────────────────────────────────────────────────────────

function toSetup(raw: RawSetup): Setup {
  return {
    id: raw.id,
    name: raw.name,
    car: raw.car,
    track: raw.track,
    settings: { ...defaultSettings(), ...(raw.settings as Partial<SetupSettings>) },
  }
}

export const setupAPI = {
  listAll: async (): Promise<Setup[]> => {
    const items = await call<RawSetup[]>('SetupListAll')
    return items.map(toSetup)
  },

  save: async (s: Setup): Promise<Setup> => {
    const raw: RawSetup = { ...s, settings: s.settings as unknown as Record<string, unknown> }
    const saved = await call<RawSetup>('SetupSave', raw)
    return toSetup(saved)
  },

  delete: async (car: string, track: string, id: string): Promise<void> => {
    await call<void>('SetupDelete', car, track, id)
  },
}
