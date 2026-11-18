import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { ButtonFunction, SprintCommand } from '../bridge'
import { Status } from '../shell/Status'
import { buttonName, buttonRows } from './DeviceControlsDomain'
import type { DeviceBinding } from './DevicesDomain'

/**
 * A device's Buttons card in its Controls tab: every function its buttons can run (dash pages,
 * the HUD) with the button that runs it. Assign asks the host to take the next press as that
 * button; Escape or Cancel stops waiting, and the host gives up by itself after ten seconds.
 */
export function DeviceButtons({
  deviceId,
  functions,
  bindings,
  listening,
  send,
}: {
  deviceId: string
  functions: readonly ButtonFunction[]
  bindings: readonly DeviceBinding[]
  /** The function on this device waiting for its button, or null. */
  listening: string | null
  send: (command: SprintCommand) => Promise<void>
}) {
  const rows = buttonRows(functions, bindings)
  const cancel = () => void send({ type: 'devices.buttonCancel' })

  useEffect(() => {
    if (listening === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void send({ type: 'devices.buttonCancel' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [listening, send])

  return (
    <section className="card list-card device-buttons" aria-label="Buttons">
      <div className="card-header">
        <h2 className="card-title">Buttons</h2>
        <span className="muted">Choose Assign, then press the button on the wheel</span>
      </div>
      <ul className="list-rows">
        {rows.map((row) => {
          const waiting = listening === row.id
          return (
            <li key={row.id} className="list-row static device-button-row">
              <span className="device-button-label">{row.label}</span>
              <span className="device-button-input">
                {waiting ? (
                  <Status tone="warning" role="status">
                    Press a button on the wheel…
                  </Status>
                ) : row.input ? (
                  <span className="chip tabular">{buttonName(row.input)}</span>
                ) : (
                  <span className="muted">Not assigned</span>
                )}
              </span>
              {waiting ? (
                <button type="button" className="button subtle device-button-action" onClick={cancel}>
                  Cancel
                </button>
              ) : (
                <button type="button" className="button device-button-action" onClick={() => void send({ type: 'devices.buttonListen', deviceId, command: row.id })}>
                  {row.input ? 'Change' : 'Assign'}
                </button>
              )}
              <span className="device-button-clear">
                {row.input && !waiting && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Clear the button for ${row.label}`}
                    title="Clear"
                    onClick={() => void send({ type: 'devices.buttonClear', deviceId, command: row.id })}
                  >
                    <X size={14} />
                  </button>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
