import { useState } from 'react'
import type { SprintCommand } from '../bridge'
import {
  CUSTOM_WHEEL_MAX_DIMENSION,
  CUSTOM_WHEEL_SCREEN_DRIVERS,
  buildAddCustomDevice,
  commandErrorMessage,
  isCustomWheelScreenDriver,
  type CustomWheelScreenDriver,
} from './DevicesDomain'

/** The form's id, so the Add device dialog's footer button can submit it (`form={CUSTOM_WHEEL_FORM_ID}`). */
export const CUSTOM_WHEEL_FORM_ID = 'devices-custom-wheel-form'

/**
 * "Build your own wheel" (issue #49): the fields of the Add device dialog's "Custom wheel"
 * tab. The dialog owns the footer (Add wheel + Cancel); its submit button targets this form,
 * so Enter in any field submits too. Validation is `CustomWheelBuilder` on the host side
 * (`devices.addCustom`) — this only collects the fields and shows whatever error the host
 * rejects the command with.
 */
export function DevicesCustomWheelForm({ onAdd }: { onAdd: (command: SprintCommand) => Promise<void> }) {
  const [name, setName] = useState('')
  const [hasScreen, setHasScreen] = useState(true)
  const [driver, setDriver] = useState<CustomWheelScreenDriver>('vocore')
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (submitting) return
    setError(null)

    const trimmedName = name.trim()
    const parsedWidth = width.trim().length === 0 ? 0 : Number(width)
    const parsedHeight = height.trim().length === 0 ? 0 : Number(height)
    if (!Number.isFinite(parsedWidth) || !Number.isFinite(parsedHeight) || parsedWidth < 0 || parsedHeight < 0) {
      setError(`Resolution must be between 1 and ${CUSTOM_WHEEL_MAX_DIMENSION} pixels, or left at 0 to auto-detect.`)
      return
    }

    setSubmitting(true)
    try {
      await onAdd(buildAddCustomDevice({ name: trimmedName, hasScreen, driver, width: parsedWidth, height: parsedHeight }))
      setName('')
      setWidth('')
      setHeight('')
    } catch (submitError) {
      setError(commandErrorMessage(submitError, 'The wheel could not be added.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      id={CUSTOM_WHEEL_FORM_ID}
      className="devices-custom-wheel"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <label className="field">
        <span>Name</span>
        <input type="text" placeholder="e.g. My GT rim" value={name} autoFocus onChange={(event) => setName(event.target.value)} />
      </label>

      <label className="devices-check">
        <input type="checkbox" checked={hasScreen} onChange={(event) => setHasScreen(event.target.checked)} />
        This wheel has a screen
      </label>

      {hasScreen && (
        <>
          <label className="field">
            <span>Screen type</span>
            <select
              value={driver}
              onChange={(event) => {
                if (isCustomWheelScreenDriver(event.target.value)) setDriver(event.target.value)
              }}
            >
              {CUSTOM_WHEEL_SCREEN_DRIVERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="devices-field-pair">
            <label className="field">
              <span>Width</span>
              <input type="number" min={0} max={CUSTOM_WHEEL_MAX_DIMENSION} placeholder="Auto" value={width} onChange={(event) => setWidth(event.target.value)} />
            </label>
            <label className="field">
              <span>Height</span>
              <input type="number" min={0} max={CUSTOM_WHEEL_MAX_DIMENSION} placeholder="Auto" value={height} onChange={(event) => setHeight(event.target.value)} />
            </label>
          </div>
          <span className="field-hint">Leave both empty or at 0 to auto-detect the panel size once connected.</span>
        </>
      )}

      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </form>
  )
}
