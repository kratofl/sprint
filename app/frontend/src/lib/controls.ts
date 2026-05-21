import {
  CaptureNextButton,
  GetBindings,
  GetCommandCatalog,
  SaveBindings,
} from '../../wailsjs/go/main/App'
import { runDesktopCall } from '@/lib/wails'

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
    return runDesktopCall('GetCommandCatalog', async () => {
      const catalog = await GetCommandCatalog()
      return catalog.map(command => ({
        id: command.id,
        label: command.label,
        category: command.category,
        capturable: command.capturable,
        deviceOnly: command.deviceOnly,
      }))
    })
  },

  async getBindings(): Promise<ControlsConfig> {
    return runDesktopCall('GetBindings', async () => {
      const config = await GetBindings()
      return {
        bindings: config.bindings.map(binding => ({
          button: binding.button,
          command: binding.command,
        })),
      }
    })
  },

  async saveBindings(cfg: ControlsConfig): Promise<void> {
    await runDesktopCall('SaveBindings', () => SaveBindings(cfg as never))
  },

  async captureButton(timeoutSecs: number): Promise<number> {
    return runDesktopCall('CaptureNextButton', () => CaptureNextButton(timeoutSecs))
  },
}
