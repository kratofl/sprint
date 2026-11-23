import { useId } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import './SettingsView.css'

/**
 * Two layouts for settings. The grouped list (`SettingsList` + `ListRow`) is the Settings page's:
 * one card per titled group, rows split by hairlines, a label at the left and the control at the
 * right, with an explanation under the group only where it adds something; a group too big for
 * the page folds into an `OpenRow` that opens its own page. The setting cards
 * (`SettingsGroup` + `SettingRow`) are the dash designer's Settings section: a card per setting
 * with an icon, a title and a one-line description.
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

export type ControlLabels = { 'aria-labelledby': string; 'aria-describedby'?: string }

/** A grouped list: an optional title, one card holding the rows, and an optional footnote under it. */
export function SettingsList({ title, footer, children }: { title?: string; footer?: ReactNode; children: ReactNode }) {
  const id = useId()
  return (
    <section className="settings-list" aria-labelledby={title ? id : undefined}>
      {title && (
        <h2 id={id} className="settings-list-title">
          {title}
        </h2>
      )}
      <div className="card settings-list-card">{children}</div>
      {footer && <p className="settings-list-footer">{footer}</p>}
    </section>
  )
}

/**
 * One row of a grouped list: the label (and a second line when it adds something) at the left,
 * the control at the right. The control is a render prop so it can point its accessible name and
 * description at the row's own text.
 */
export function ListRow({
  id,
  label,
  detail,
  detailTone = null,
  children,
}: {
  id: string
  label: ReactNode
  detail?: ReactNode
  detailTone?: 'danger' | null
  children: (labels: ControlLabels) => ReactNode
}) {
  const labelId = `${id}-label`
  const detailId = `${id}-detail`
  return (
    <div className="settings-list-row">
      <div className="settings-list-text">
        <span id={labelId}>{label}</span>
        {detail && (
          <span id={detailId} className={detailTone ? `settings-list-detail tone-${detailTone}` : 'settings-list-detail'}>
            {detail}
          </span>
        )}
      </div>
      <div className="settings-list-control">{children({ 'aria-labelledby': labelId, 'aria-describedby': detail ? detailId : undefined })}</div>
    </div>
  )
}

/**
 * A grouped-list row that opens its own page: the label (and a second line), then where it stands
 * now ("Sprint", "Connected") and a chevron. The whole row is the button.
 */
export function OpenRow({ label, detail, value, onOpen }: { label: string; detail?: string; value: string; onOpen: () => void }) {
  return (
    <button type="button" className="settings-list-row settings-open-row" onClick={onOpen}>
      <span className="settings-list-text">
        <span>{label}</span>
        {detail && <span className="settings-list-detail">{detail}</span>}
      </span>
      <span className="settings-open-value">{value}</span>
      <ChevronRight className="settings-open-chevron" aria-hidden="true" />
    </button>
  )
}

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

