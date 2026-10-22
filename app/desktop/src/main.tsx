// Shared primitives first, so every view's CSS (imported through App) lands after them
// in the bundle and can adjust a primitive with an ordinary selector.
import './styles.css'
// Mac overrides, every rule scoped to [data-platform="mac"], so Windows and Linux render exactly styles.css.
import './styles.mac.css'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { DashOutput, dashDeviceId } from './DashOutput'
import { platform } from './platform'

// One bundle serves both surfaces: the app shell, and the offscreen dashboard
// windows Electron opens per screen. The query string picks which one mounts.
const deviceId = dashDeviceId(window.location.search)

// Dash output is captured and pushed to wheel hardware, so its page background
// must stay dark whatever the OS theme is: a light window body behind an idle
// (blank) dash would light up the driver's screen.
if (deviceId) document.documentElement.dataset.theme = 'dark'

// Picks the token set (desktop.css or the macos.css overlay) and the Mac shapes in styles.mac.css.
document.documentElement.dataset.platform = platform

// On macOS the main window draws vibrancy (or its solid fallback) behind the page, so the
// sidebar leaves it showing (styles.mac.css `[data-backdrop]`).
if (!deviceId && new URLSearchParams(window.location.search).get('backdrop') === 'window') {
  document.documentElement.dataset.backdrop = 'window'
}

createRoot(document.getElementById('root')!).render(
  deviceId ? <DashOutput deviceId={deviceId} /> : <App />,
)
