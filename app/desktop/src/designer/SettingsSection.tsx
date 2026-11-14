import { useState } from 'react'
import { ChevronRight, Copy, Monitor, Moon, RotateCcw, Tag, Trash2 } from 'lucide-react'
import type { DashLayout } from '@sprint/dashboard'
import type { DashCategoryLists } from '../bridge'
import { ConfirmDialog } from '../shell/ContentDialog'
import { InlineName } from '../shell/InlineName'
import { SettingRow, SettingsGroup } from '../views/SettingsLayout'
import { DashStill } from '../views/DashStill'
import {
  addIdlePage,
  dashPageCount,
  fitScreenSize,
  formatPageCount,
  knownDashCategory,
  layoutScreenProfile,
  refitLossHint,
  refitLossNote,
  removeIdlePage,
  renameLayout,
  type DashCategoryChoice,
  type ScreenChoice,
  type ScreenProfile,
} from '../views/DashesDomain'
import type { Mutate } from './useDesignerDoc'
import './SettingsSection.css'

type Apply = (mutate: Mutate, group?: string) => boolean

/**
 * Settings: everything about the dash that is not drawing, in one calm column. A heading like a
 * device's — its still picture, its name renamed in place, what it is — then the Dash group
 * (category, screen size, idle page) and Copy and reset (duplicate, reset to the preset, delete).
 * Renaming and the idle page are edits of the document (saved and undone like any other); the
 * rest are the host's commands, run by the window. A screen size that cannot hold every widget
 * says so under its name, and after it is picked a note under the row says how many were left out.
 */
export function SettingsSection({
  layout,
  apply,
  categories,
  screens,
  losses,
  onCategory,
  onScreenProfile,
  onDuplicate,
  onReset,
  onDelete,
}: {
  layout: DashLayout
  apply: Apply
  categories: DashCategoryLists
  /** The screen sizes, the user's own screens' first ("Fits …"). */
  screens: { fitting: ScreenChoice[]; other: ScreenChoice[] }
  /** Screen profile id → widgets a change to that size would leave out (the host's `dashRefitLosses` for this dash). */
  losses: Readonly<Record<string, number>>
  onCategory: (category: DashCategoryChoice) => void
  onScreenProfile: (profileId: string) => void
  onDuplicate: () => void
  onReset: () => void
  onDelete: () => void
}) {
  const [confirming, setConfirming] = useState<'reset' | 'delete' | null>(null)
  // The last size picked that left widgets out; its note shows while the dash is still on that size.
  const [refitted, setRefitted] = useState<{ profile: ScreenProfile; lost: number } | null>(null)
  const category = knownDashCategory(layout, categories)
  const profile = layoutScreenProfile(layout)
  const pickedOther = screens.other.some((choice) => choice.profile.id === profile.id)
  // With none of the user's screens to put first, every size is simply listed.
  const [showOther, setShowOther] = useState(pickedOther || screens.fitting.length === 0)
  const sizes = showOther || pickedOther ? [...screens.fitting, ...screens.other] : screens.fitting
  const categoryOptions: Array<{ value: DashCategoryChoice; label: string }> = [
    ...[...categories.builtIn, ...categories.custom].map((value) => ({ value, label: value })),
    { value: null, label: 'Other' },
  ]

  return (
    <div className="designer-settings">
      <header className="designer-settings-head">
        <span className="designer-settings-still">
          <DashStill layout={layout} maxWidth={150} maxHeight={90} />
        </span>
        <div className="designer-settings-title">
          <InlineName key={layout.name} name={layout.name || 'Untitled dash'} label="Dash name" onRename={(name) => apply((current) => renameLayout(current, name))} />
          <span className="muted designer-settings-meta">{`${profile.name} · ${category ?? 'Other'} · ${formatPageCount(dashPageCount(layout))}`}</span>
        </div>
      </header>

      <SettingsGroup title="Dash">
        <SettingRow id="dash-category" icon={Tag} title="Category" description="Groups it on the Dashes page.">
          {(labels) => (
            <div className="segmented" role="radiogroup" {...labels}>
              {categoryOptions.map((option) => (
                <button key={option.label} type="button" role="radio" className="segmented-item" aria-checked={category === option.value} onClick={() => category !== option.value && onCategory(option.value)}>
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </SettingRow>

        <SettingRow id="dash-screen" icon={Monitor} title="Screen size" description="Changing it refits every page; widgets keep their place on the grid.">
          {(labels) => (
            <div className="designer-settings-sizes" role="radiogroup" {...labels}>
              {sizes.map((choice) => {
                const shape = fitScreenSize(choice.profile, 28, 20)
                const checked = choice.profile.id === profile.id
                const lost = checked ? 0 : (losses[choice.profile.id] ?? 0)
                const pick = (): void => {
                  setRefitted(lost > 0 ? { profile: choice.profile, lost } : null)
                  onScreenProfile(choice.profile.id)
                }
                return (
                  <button key={choice.profile.id} type="button" role="radio" aria-checked={checked} className="designer-settings-size" onClick={() => !checked && pick()}>
                    <span className="designer-settings-shape" aria-hidden="true">
                      <span style={{ width: shape.width, height: shape.height }} />
                    </span>
                    <span className="designer-settings-size-text">
                      <span className="designer-settings-size-name">{choice.profile.name}</span>
                      {choice.fits.length > 0 && <span className="muted">{`Fits ${choice.fits.join(', ')}`}</span>}
                      {lost > 0 && <span className="designer-settings-size-loss">{refitLossHint(lost)}</span>}
                    </span>
                  </button>
                )
              })}
              {!showOther && !pickedOther && screens.other.length > 0 && (
                <button type="button" className="button subtle small designer-settings-more" onClick={() => setShowOther(true)}>
                  Other sizes <ChevronRight />
                </button>
              )}
            </div>
          )}
        </SettingRow>
        {refitted && refitted.profile.id === profile.id && (
          <div className="infobar warning" role="status">
            <span className="infobar-icon" aria-hidden="true">
              !
            </span>
            <span className="infobar-message">{refitLossNote(refitted.lost, refitted.profile)}</span>
          </div>
        )}

        <SettingRow id="dash-idle" icon={Moon} title="Idle page" description="Shown while you are in the menus or the garage.">
          {(labels) => (
            <div className="segmented" role="radiogroup" {...labels}>
              <button type="button" role="radio" className="segmented-item" aria-checked={Boolean(layout.idlePage)} onClick={() => !layout.idlePage && apply((current) => addIdlePage(current))}>
                Idle
              </button>
              <button type="button" role="radio" className="segmented-item" aria-checked={!layout.idlePage} onClick={() => layout.idlePage && apply((current) => removeIdlePage(current))}>
                None
              </button>
            </div>
          )}
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Copy and reset">
        <SettingRow id="dash-duplicate" icon={Copy} title="Duplicate" description="A copy to try changes on, in the same category. It opens in its own window.">
          {(labels) => (
            <button type="button" className="button" {...labels} onClick={onDuplicate}>
              Duplicate
            </button>
          )}
        </SettingRow>
        <SettingRow id="dash-reset" icon={RotateCcw} title="Reset to preset" description="Puts back the pages, alerts and look of the preset Sprint ships. Can be undone.">
          {(labels) => (
            <button type="button" className="button" {...labels} onClick={() => setConfirming('reset')}>
              Reset…
            </button>
          )}
        </SettingRow>
        <SettingRow id="dash-delete" icon={Trash2} iconTone="danger" title="Delete dash" description="Removes it for good, after you confirm.">
          {(labels) => (
            <button type="button" className="button destructive" {...labels} onClick={() => setConfirming('delete')}>
              Delete…
            </button>
          )}
        </SettingRow>
      </SettingsGroup>

      {confirming === 'reset' && (
        <ConfirmDialog
          title="Reset to preset?"
          message={`${layout.name} gets the preset's pages, alerts and look. Undo brings your design back.`}
          confirmLabel="Reset"
          destructive
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            setConfirming(null)
            onReset()
          }}
        />
      )}

      {confirming === 'delete' && (
        <ConfirmDialog
          title={`Delete ${layout.name}?`}
          message="The dash and all of its pages are removed, and this window closes. This cannot be undone."
          confirmLabel="Delete"
          destructive
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            setConfirming(null)
            onDelete()
          }}
        />
      )}
    </div>
  )
}
