import { useId } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import './SettingsView.css'

/**
 * The Windows 11 Settings layout pieces: titled groups of setting cards, each with an icon, a
 * title, a one-line description and its control on the right. Settings and On track build from these.
 */

export const blurOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
  if (event.key === 'Enter') event.currentTarget.blur()
}

export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section className="settings-group" aria-labelledby={id}>
      <h2 id={id} className="settings-group-title">
        {title}
      </h2>
      {children}
    </section>
  )
}

export type ControlLabels = { 'aria-labelledby': string; 'aria-describedby': string }

/**
 * One Windows 11 setting card. The control is a render prop so it can point
 * its accessible name and description at the card's own title and text.
 */
export function SettingRow({
  id,
  icon: Icon,
  iconTone = null,
  title,
  description,
  children,
}: {
  id: string
  icon: LucideIcon
  iconTone?: 'success' | 'danger' | null
  title: string
  description: ReactNode
  children: (labels: ControlLabels) => ReactNode
}) {
  const titleId = `${id}-title`
  const descriptionId = `${id}-description`
  return (
    <div className="card settings-row">
      <Icon className={`settings-row-icon${iconTone ? ` tone-${iconTone}` : ''}`} aria-hidden="true" />
      <div className="settings-row-text">
        <span id={titleId} className="settings-row-title">
          {title}
        </span>
        <span id={descriptionId} className="settings-row-description">
          {description}
        </span>
      </div>
      <div className="settings-row-control">{children({ 'aria-labelledby': titleId, 'aria-describedby': descriptionId })}</div>
    </div>
  )
}

/** Fluent ToggleSwitch: "On"/"Off" to its left, applies immediately. */
export function Switch({ checked, onChange, ...labels }: ControlLabels & { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <span className="settings-switch-field">
      <span className="settings-switch-state" aria-hidden="true">
        {checked ? 'On' : 'Off'}
      </span>
      <button type="button" role="switch" aria-checked={checked} className="settings-switch" onClick={() => onChange(!checked)} {...labels}>
        <span className="settings-switch-knob" />
      </button>
    </span>
  )
}
