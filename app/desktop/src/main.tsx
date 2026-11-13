// Shared primitives first, so every view's CSS (imported through App) lands after them
// in the bundle and can adjust a primitive with an ordinary selector.
import './styles.css'
// Mac overrides, every rule scoped to [data-platform="mac"], so Windows and Linux render exactly styles.css.
import './styles.mac.css'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { HudWindow } from './hud/HudWindow'
import { DashDesigner } from './designer/DashDesigner'
import { PitWallRoot } from './pitwall/PitWallRoot'
import { pitWallRoute } from './pitwall/route'
import { platform } from './platform'

// One bundle serves every surface: the app shell, the training HUD's windows (electron/hud.ts),
// the dash designer's windows (electron/designerWindows.ts) and the pit wall's
// (electron/pitWallWindows.ts). The query string picks.
const hudWindow = new URLSearchParams(window.location.search).has('hud')
const designerDashId = new URLSearchParams(window.location.search).get('designer')
const pitWall = pitWallRoute(window.location.search)

// The HUD sits on a game image, not on the app, so it is dark glass whatever the OS theme is.
if (hudWindow) {
  document.documentElement.dataset.theme = 'dark'
  document.documentElement.dataset.surface = 'hud'
}

// The designer fills its own window edge to edge: no app minimum width, no page scrollbar.
if (designerDashId) document.documentElement.dataset.surface = 'designer'

// The pit wall fills its window too, from a full screen down to one tile.
if (pitWall) document.documentElement.dataset.surface = 'pitwall'

// Picks the token set (desktop.css or the macos.css overlay) and the Mac shapes in styles.mac.css.
document.documentElement.dataset.platform = platform

// On macOS the main window draws vibrancy (or its solid fallback) behind the page, so the
// sidebar leaves it showing (styles.mac.css `[data-backdrop]`).
if (!hudWindow && !designerDashId && !pitWall && new URLSearchParams(window.location.search).get('backdrop') === 'window') {
  document.documentElement.dataset.backdrop = 'window'
}

createRoot(document.getElementById('root')!).render(
  hudWindow ? (
    <HudWindow />
  ) : designerDashId ? (
    <DashDesigner dashId={designerDashId} />
  ) : pitWall ? (
    <PitWallRoot route={pitWall} />
  ) : (
    <App />
  ),
)
