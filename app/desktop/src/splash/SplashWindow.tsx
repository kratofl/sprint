import { useEffect, useState } from 'react'
import { bridge, type UpdateStatus } from '../bridge'
import sprintMark from '../assets/sprint-mark.svg'
import { Backdrop } from '../shell/Backdrop'
import { displayVersion } from '../shell/updates'
import './SplashWindow.css'

/**
 * The splash (`?splash=1`, electron/main.ts `createSplashWindow`): an installed build shows it at
 * launch while the host starts and, with automatic installs on, while an update is checked for,
 * downloaded and installed. The main process closes it, or quits into the installer.
 */
export function SplashWindow() {
  const [status, setStatus] = useState<UpdateStatus>({ kind: 'idle' })
  useEffect(() => bridge.subscribeUpdates(setStatus), [])
  return (
    <div className="splash">
      <Backdrop tone="ambient" />
      <img className="splash-mark" src={sprintMark} alt="Sprint" />
      <SplashStatus status={status} />
    </div>
  )
}

function SplashStatus({ status }: { status: UpdateStatus }) {
  switch (status.kind) {
    case 'checking':
      return <strong>Checking for updates</strong>
    case 'downloading':
      return (
        <>
          <strong>Updating Sprint</strong>
          <div className="meter splash-meter" role="progressbar" aria-label="Download" aria-valuemin={0} aria-valuemax={100} aria-valuenow={status.percent}>
            <span style={{ width: `${status.percent}%` }} />
          </div>
          <span className="splash-detail tabular">
            {displayVersion(status.version)} · {status.percent}%
          </span>
        </>
      )
    case 'installing':
      return (
        <>
          <strong>Installing…</strong>
          <span className="splash-detail tabular">{displayVersion(status.version)}</span>
        </>
      )
    default:
      return <strong>Starting Sprint</strong>
  }
}
