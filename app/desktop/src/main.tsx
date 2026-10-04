// Shared primitives first, so every view's CSS (imported through App) lands after them
// in the bundle and can adjust a primitive with an ordinary selector.
import './styles.css'
// Mac overrides, every rule scoped to [data-platform="mac"], so Windows renders exactly styles.css.
import './styles.mac.css'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { DashOutput, dashDeviceId } from './DashOutput'
import { platform } from './platform'

// One bundle serves both surfaces: the app shell, and the offscreen dashboard
// windows Electron opens per screen. The query string picks which one mounts.
const deviceId = dashDeviceId(window.location.search)

// Dash output is captured and pushed to wheel hardware, so its page background
// must stay dark whatever the OS theme is: a light Mica body behind an idle
// (blank) dash would light up the driver's screen.
if (deviceId) document.documentElement.dataset.theme = 'dark'

// Picks the token set (windows.css or the macos.css overlay) and the shell layout in styles.mac.css.
document.documentElement.dataset.platform = platform

// The main window draws Windows Mica or macOS vibrancy (or a solid fallback) behind the
// page, so the title bar / sidebar leave it showing (styles.css `[data-backdrop]`).
if (!deviceId && new URLSearchParams(window.location.search).get('backdrop') === 'window') {
  document.documentElement.dataset.backdrop = 'window'
}

createRoot(document.getElementById('root')!).render(
  deviceId ? <DashOutput deviceId={deviceId} /> : <App />,
)
