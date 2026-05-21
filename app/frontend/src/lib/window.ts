import {
  WindowClose,
  WindowMaximise,
  WindowMinimise,
} from '../../wailsjs/go/main/App'
import { runDesktopCall } from './wails'

export const windowAPI = {
  minimise(): Promise<void> {
    return runDesktopCall('WindowMinimise', () => WindowMinimise())
  },

  toggleMaximise(): Promise<void> {
    return runDesktopCall('WindowMaximise', () => WindowMaximise())
  },

  close(): Promise<void> {
    return runDesktopCall('WindowClose', () => WindowClose())
  },
}
