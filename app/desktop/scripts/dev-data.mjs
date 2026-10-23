// Where a dev run of this checkout keeps its data: the host's settings, laps and logs, and
// Electron's browser profile. Inside the checkout, so every worktree has its own and none of them
// ever touches the installed app's folder (%AppData%\Sprint, ~/.config/Sprint on macOS).
// `make dev-app` and `make dev-host` use it; `make reset-dev-data` deletes it.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

export const devDataRoot = path.join(desktopRoot, '.dev', 'data')
