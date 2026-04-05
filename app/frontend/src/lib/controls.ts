// Types and Wails bindings for the controls panel (wheel button → command bindings).

import { call } from '@/lib/wails'

// Types.

export interface CommandMeta {
  id: string
  label: string
  category: string
  capturable: boolean
  deviceOnly: boolean
}

export interface Binding {
  /** Wheel button channel number. 0 means unbound. */
  button: number
  /** Command ID from the command catalog. */
  command: string
}

export interface ControlsConfig {
  bindings: Binding[]
}

// API.

export const controlsAPI = {
  async getCommandCatalog(): Promise<CommandMeta[]> {
    const raw = await call<unknown[]>('GetCommandCatalog')
    if (!Array.isArray(raw)) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return raw.map((r: any): CommandMeta => ({
      id:         r.id         ?? '',
      label:      r.label      ?? '',
      category:   r.category   ?? '',
      capturable: r.capturable ?? false,
      deviceOnly: r.deviceOnly ?? false,
    }))
  },

  async getBindings(): Promise<ControlsConfig> {
    const raw = await call<{ bindings?: unknown[] }>('GetBindings')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bindings: Binding[] = Array.isArray(raw?.bindings)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? raw.bindings.map((b: any): Binding => ({
          button:  b.button  ?? 0,
          command: b.command ?? '',
        }))
      : []
    return { bindings }
  },

  async saveBindings(cfg: ControlsConfig): Promise<void> {
    await call<void>('SaveBindings', cfg)
  },

  async captureButton(timeoutSecs: number): Promise<number> {
    return call<number>('CaptureNextButton', timeoutSecs)
  },
}
