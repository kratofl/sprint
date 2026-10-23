import { useState } from 'react'
import type { SprintCommand } from '../bridge'
import {
  CUSTOM_WHEEL_MAX_DIMENSION,
  CUSTOM_WHEEL_SCREEN_DRIVERS,
  buildAddCustomDevice,
  commandErrorMessage,
  type CustomWheelScreenDriver,
} from './DevicesDomain'
import { DeviceImage } from './DeviceImage'

/** The form's id, so the Add device dialog's footer button can submit it (`form={CUSTOM_WHEEL_FORM_ID}`). */
export const CUSTOM_WHEEL_FORM_ID = 'devices-custom-wheel-form'

type ScreenChoice = 'none' | CustomWheelScreenDriver

const SCREEN_CHOICES: ReadonlyArray<{ value: ScreenChoice; label: string }> = [{ value: 'none', label: 'None' }, ...CUSTOM_WHEEL_SCREEN_DRIVERS]

/**
 * "Your own wheel" (issue #49): the Add device dialog's second step. The dialog owns the
 * footer (Add wheel + Cancel); its submit button targets this form, so Enter in any field
 * submits too. The screen's size is read from the panel when it connects, so width and height
 * stay hidden until asked for. Validation is `CustomWheelBuilder` on the host side
 * (`devices.addCustom`) — this only collects the fields and shows whatever error the host
 * rejects the command with.
 */
export function DevicesCustomWheelForm({ onAdd }: { onAdd: (command: SprintCommand) => Promise<void> }) {
  const [name, setName] = useState('')
  const [screen, setScreen] = useState<ScreenChoice>('vocore')
  const [setSize, setSetSize] = useState(false)
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (submitting) return
    setError(null)

    const parsedWidth = !setSize || width.trim().length === 0 ? 0 : Number(width)
    const parsedHeight = !setSize || height.trim().length === 0 ? 0 : Number(height)
    if (!Number.isFinite(parsedWidth) || !Number.isFinite(parsedHeight) || parsedWidth < 0 || parsedHeight < 0) {
      setError(`Width and height go from 1 to ${CUSTOM_WHEEL_MAX_DIMENSION} pixels. Leave them empty to read them from the screen.`)
      return
    }

    setSubmitting(true)
    try {
      await onAdd(
        buildAddCustomDevice({
          name,
          hasScreen: screen !== 'none',
          driver: screen === 'none' ? 'vocore' : screen,
          width: parsedWidth,
          height: parsedHeight,
        }),
      )
    } catch (submitError) {
      setError(commandErrorMessage(submitError, 'The wheel could not be added.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      id={CUSTOM_WHEEL_FORM_ID}
      className="devices-own"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <DeviceImage image="generic-wheel" className="devices-own-image" />
      <div className="devices-own-fields">
        <label className="field">
          <span>Name</span>
          <input type="text" placeholder="e.g. My GT rim" value={name} autoFocus onChange={(event) => setName(event.target.value)} />
        </label>

        <div className="field">
          <span id="devices-own-screen">Screen</span>
          <div className="segmented" role="radiogroup" aria-labelledby="devices-own-screen">
            {SCREEN_CHOICES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                className="segmented-item"
                aria-checked={screen === option.value}
                onClick={() => setScreen(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {screen !== 'none' && (
          <div className="field">
            <span>Size</span>
            {setSize ? (
              <>
                <div className="devices-field-pair">
                  <input
                    type="number"
                    min={1}
                    max={CUSTOM_WHEEL_MAX_DIMENSION}
                    placeholder="Width"
                    aria-label="Width"
                    value={width}
                    autoFocus
                    onChange={(event) => setWidth(event.target.value)}
                  />
                  <input
                    type="number"
                    min={1}
                    max={CUSTOM_WHEEL_MAX_DIMENSION}
                    placeholder="Height"
                    aria-label="Height"
                    value={height}
                    onChange={(event) => setHeight(event.target.value)}
                  />
                </div>
                <span className="field-hint">Leave them empty to read the size from the screen.</span>
              </>
            ) : (
              <span className="muted">
                Read from the screen when it connects.{' '}
                <button type="button" className="devices-link" onClick={() => setSetSize(true)}>
                  Set it yourself
                </button>
              </span>
            )}
          </div>
        )}

        {error && (
          <span className="field-error" role="alert">
            {error}
          </span>
        )}
      </div>
    </form>
  )
}
