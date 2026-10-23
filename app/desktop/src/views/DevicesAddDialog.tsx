import { useState } from 'react'
import type { SprintCommand } from '../bridge'
import { ContentDialog } from '../shell/ContentDialog'
import { Status } from '../shell/Status'
import {
  NO_CATALOG_FILTER,
  catalogBrands,
  catalogImageKey,
  catalogLine,
  deviceKind,
  matchesCatalogFilter,
  ownWheelMatchesFilter,
} from './DevicesDomain'
import type { CatalogEntry, CatalogFilter, DeviceKind } from './DevicesDomain'
import { DeviceImage } from './DeviceImage'
import { CUSTOM_WHEEL_FORM_ID, DevicesCustomWheelForm } from './DevicesCustomWheelForm'

const KINDS: ReadonlyArray<{ id: CatalogFilter['kind']; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'wheel', label: 'Wheels' },
  { id: 'screen', label: 'Screens' },
]

const GROUPS: ReadonlyArray<{ kind: DeviceKind; title: string }> = [
  { kind: 'wheel', title: 'Wheels' },
  { kind: 'screen', title: 'Screens' },
]

/**
 * "Add device": what is plugged in but not added yet first (`found`, from the host's USB
 * scan), then every catalog entry as a picture card under Wheels and Screens, narrowed by a
 * search and by kind and brand. A click adds the entry. "Your own wheel" opens a second step,
 * the custom-wheel form, whose footer carries the primary button. Esc closes; the smoke does
 * not, so a half-filled wheel is never lost to a stray click.
 */
export function DevicesAddDialog({
  catalog,
  found,
  onClose,
  onAdd,
  onAddCustom,
}: {
  catalog: CatalogEntry[]
  /** Plugged in and not added yet, once per device. */
  found: CatalogEntry[]
  onClose: () => void
  onAdd: (entry: CatalogEntry) => void
  onAddCustom: (command: SprintCommand) => Promise<void>
}) {
  const [step, setStep] = useState<'pick' | 'own'>('pick')
  const [filter, setFilter] = useState<CatalogFilter>(NO_CATALOG_FILTER)

  if (step === 'own') {
    return (
      <ContentDialog
        title="Your own wheel"
        className="devices-add-dialog"
        onBack={() => setStep('pick')}
        onCancel={onClose}
        footer={
          <>
            <button type="submit" form={CUSTOM_WHEEL_FORM_ID} className="button primary">
              Add wheel
            </button>
            <button type="button" className="button" onClick={onClose}>
              Cancel
            </button>
          </>
        }
      >
        <DevicesCustomWheelForm onAdd={onAddCustom} />
      </ContentDialog>
    )
  }

  const brands = catalogBrands(catalog)
  const plugged = found.filter((entry) => matchesCatalogFilter(filter, entry))
  const groups = GROUPS.map((group) => ({
    ...group,
    entries: catalog.filter((entry) => deviceKind(entry) === group.kind && matchesCatalogFilter(filter, entry)),
    ownWheel: group.kind === 'wheel' && ownWheelMatchesFilter(filter),
  })).filter((group) => group.entries.length > 0 || group.ownWheel)

  return (
    <ContentDialog
      title="Add device"
      className="devices-add-dialog"
      onCancel={onClose}
      footer={
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
      }
    >
      <input
        type="search"
        placeholder="Search wheels and screens"
        aria-label="Search wheels and screens"
        value={filter.query}
        autoFocus
        onChange={(event) => setFilter({ ...filter, query: event.target.value })}
      />
      <div className="devices-add-filters">
        <div className="segmented" role="radiogroup" aria-label="Kind">
          {KINDS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              className="segmented-item"
              aria-checked={filter.kind === option.id}
              onClick={() => setFilter({ ...filter, kind: option.id })}
            >
              {option.label}
            </button>
          ))}
        </div>
        {brands.length > 1 && (
          <div className="segmented" role="radiogroup" aria-label="Brand">
            {[null, ...brands].map((brand) => (
              <button
                key={brand ?? ''}
                type="button"
                role="radio"
                className="segmented-item"
                aria-checked={filter.brand === brand}
                onClick={() => setFilter({ ...filter, brand })}
              >
                {brand ?? 'All brands'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="devices-add-results">
        {plugged.length > 0 && (
          <section aria-labelledby="devices-add-found">
            <h3 id="devices-add-found" className="devices-add-section">
              Plugged in now
            </h3>
            <ul className="devices-found-list">
              {plugged.map((entry, index) => (
                // The same entry repeats when two of it are plugged in, so the index keeps keys apart.
                <li key={`${entry.id}-${index}`} className="card devices-found">
                  <DeviceImage image={catalogImageKey(entry)} className="devices-found-image" />
                  <span className="devices-add-text">
                    <span className="devices-name">{entry.name}</span>
                    <Status tone="success">Found on USB</Status>
                  </span>
                  {/* One primary per view: with several found, none of them outranks the rest. */}
                  <button type="button" className={plugged.length === 1 ? 'button primary' : 'button'} onClick={() => onAdd(entry)}>
                    Add
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {groups.map((group) => (
          <section key={group.kind} aria-labelledby={`devices-add-${group.kind}`}>
            <h3 id={`devices-add-${group.kind}`} className="devices-add-section">
              {group.title}
            </h3>
            <div className="devices-add-grid">
              {group.entries.map((entry) => (
                <button key={entry.id} type="button" className="card devices-add-card" onClick={() => onAdd(entry)}>
                  <DeviceImage image={catalogImageKey(entry)} className="devices-add-card-image" />
                  <span className="devices-add-text">
                    <span className="devices-name">{entry.name}</span>
                    <span className="muted devices-line">{catalogLine(entry)}</span>
                  </span>
                </button>
              ))}
              {group.ownWheel && (
                <button type="button" className="card devices-add-card" onClick={() => setStep('own')}>
                  <DeviceImage image="generic-wheel" className="devices-add-card-image" />
                  <span className="devices-add-text">
                    <span className="devices-name">Your own wheel</span>
                    <span className="muted devices-line">Pick its screen, if it has one</span>
                  </span>
                </button>
              )}
            </div>
          </section>
        ))}

        {plugged.length === 0 && groups.length === 0 && (
          <div className="devices-add-none">
            <p className="muted">Nothing matches.</p>
            <button type="button" className="button" onClick={() => setFilter(NO_CATALOG_FILTER)}>
              Clear filters
            </button>
          </div>
        )}
      </div>
    </ContentDialog>
  )
}
