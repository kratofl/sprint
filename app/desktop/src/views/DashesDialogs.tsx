import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import type { DashLayout } from '@sprint/dashboard'
import type { DashCategoryLists } from '../bridge'
import { ContentDialog } from '../shell/ContentDialog'
import { fitScreenSize, defaultDashName, initialScreenProfile, knownDashCategory, refitLossWarning, dashCategoryNameProblem } from './DashesDomain'
import type { DashCategoryChoice, DashStart, ScreenChoice, ScreenProfile } from './DashesDomain'

/** What the New dash and Duplicate dialogs send: `buildDashCreate`'s options, all chosen. */
export type NewDash = { start: DashStart; profileId: string; name: string | undefined; category: DashCategoryChoice }

type Screens = { fitting: ScreenChoice[]; other: ScreenChoice[] }

/**
 * New dash, one page: Name · Screen · Category. It always starts blank; a copy comes from
 * Duplicate in a dash's menu (`DuplicateDashDialog`). The sizes of the user's own screens come
 * first ("Fits …"), the rest are behind "Other sizes". A name left empty is the host's (the
 * placeholder shows it).
 */
export function NewDashDialog({
  categories,
  screens,
  initialCategory,
  onCancel,
  onCreate,
}: {
  categories: DashCategoryLists
  screens: Screens
  initialCategory: DashCategoryChoice
  onCancel: () => void
  onCreate: (dash: NewDash) => void
}) {
  const [name, setName] = useState('')
  const [profile, setProfile] = useState<ScreenProfile>(() => initialScreenProfile(null, screens.fitting))
  const [category, setCategory] = useState<DashCategoryChoice>(initialCategory)

  return (
    <ContentDialog
      title="New dash"
      className="dashes-new-dialog"
      onCancel={onCancel}
      onSubmit={(event) => {
        event.preventDefault()
        onCreate({ start: { kind: 'blank' }, profileId: profile.id, name: name.trim() || undefined, category })
      }}
      footer={<CreateFooter onCancel={onCancel} />}
    >
      <label className="dashes-field">
        <span className="dashes-field-label">Name</span>
        <input value={name} placeholder={defaultDashName(null)} autoFocus onChange={(event) => setName(event.target.value)} />
      </label>
      <ScreenField screens={screens} profile={profile} onPick={setProfile} />
      <CategoryField categories={categories} category={category} onPick={setCategory} />
    </ContentDialog>
  )
}

/**
 * Duplicate <dash>: Name · Screen · Category for a copy of `source`, starting on its own size and
 * category. A size too small for every widget is not refused, only warned about: the host leaves
 * out what does not fit, and `losses` (screen profile id → widgets) says how many.
 */
export function DuplicateDashDialog({
  source,
  losses,
  categories,
  screens,
  onCancel,
  onCreate,
}: {
  source: DashLayout
  losses: Readonly<Record<string, number>>
  categories: DashCategoryLists
  screens: Screens
  onCancel: () => void
  onCreate: (dash: NewDash) => void
}) {
  const [name, setName] = useState('')
  const [profile, setProfile] = useState<ScreenProfile>(() => initialScreenProfile(source, screens.fitting))
  const [category, setCategory] = useState<DashCategoryChoice>(() => knownDashCategory(source, categories))
  const lost = losses[profile.id] ?? 0

  return (
    <ContentDialog
      title={`Duplicate ${source.name}`}
      className="dashes-new-dialog"
      onCancel={onCancel}
      onSubmit={(event) => {
        event.preventDefault()
        onCreate({ start: { kind: 'copy', dashId: source.id }, profileId: profile.id, name: name.trim() || undefined, category })
      }}
      footer={<CreateFooter onCancel={onCancel} />}
    >
      <label className="dashes-field">
        <span className="dashes-field-label">Name</span>
        <input value={name} placeholder={defaultDashName(source)} autoFocus onChange={(event) => setName(event.target.value)} />
      </label>
      <ScreenField screens={screens} profile={profile} onPick={setProfile}>
        {lost > 0 && (
          <div className="infobar warning" role="status">
            <span className="infobar-icon" aria-hidden="true">
              !
            </span>
            <span className="infobar-message">{refitLossWarning(lost, profile)}</span>
          </div>
        )}
      </ScreenField>
      <CategoryField categories={categories} category={category} onPick={setCategory} />
    </ContentDialog>
  )
}

function CreateFooter({ onCancel }: { onCancel: () => void }) {
  return (
    <>
      <button type="submit" className="button primary">
        Create
      </button>
      <button type="button" className="button" onClick={onCancel}>
        Cancel
      </button>
    </>
  )
}

/** The Screen field: every size as a radio row, the user's own first, the rest behind "Other sizes"; `children` sit under the list. */
function ScreenField({ screens, profile, onPick, children }: { screens: Screens; profile: ScreenProfile; onPick: (profile: ScreenProfile) => void; children?: ReactNode }) {
  // With none of the user's screens to put first, every size is simply listed; a preselected other size starts in view.
  const [showOther, setShowOther] = useState(() => screens.fitting.length === 0 || screens.other.some((choice) => choice.profile.id === profile.id))
  const sizes = showOther ? [...screens.fitting, ...screens.other] : screens.fitting

  return (
    <div className="dashes-field">
      <span className="dashes-field-label">Screen</span>
      <div className="dashes-sizes" role="radiogroup" aria-label="Screen">
        {sizes.map((choice) => (
          <ScreenRow key={choice.profile.id} choice={choice} checked={choice.profile.id === profile.id} onPick={() => onPick(choice.profile)} />
        ))}
        {!showOther && screens.other.length > 0 && (
          <button type="button" className="button subtle small dashes-more-sizes" onClick={() => setShowOther(true)}>
            <ChevronRight /> Other sizes
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

/** The Category field: None, then every category, as one segmented choice. */
function CategoryField({ categories, category, onPick }: { categories: DashCategoryLists; category: DashCategoryChoice; onPick: (category: DashCategoryChoice) => void }) {
  const options: Array<{ value: DashCategoryChoice; label: string }> = [
    { value: null, label: 'None' },
    ...[...categories.builtIn, ...categories.custom].map((value) => ({ value, label: value })),
  ]

  return (
    <div className="dashes-field">
      <span className="dashes-field-label">Category</span>
      <div className="segmented dashes-category-pick" role="radiogroup" aria-label="Category">
        {options.map((option) => (
          <button key={option.label} type="button" role="radio" className="segmented-item" aria-checked={category === option.value} onClick={() => onPick(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** One screen size: a radio, the size drawn as its shape, its name, and which of your screens it fits. */
function ScreenRow({ choice, checked, onPick }: { choice: ScreenChoice; checked: boolean; onPick: () => void }) {
  const shape = fitScreenSize(choice.profile, 20, 20)
  return (
    <button type="button" role="radio" aria-checked={checked} className="dashes-size" onClick={onPick}>
      <span className="dashes-size-radio" aria-hidden="true" />
      <span className="dashes-size-shape" aria-hidden="true">
        <span style={{ width: shape.width, height: shape.height }} />
      </span>
      <span>{choice.profile.name}</span>
      <span className="muted">{choice.fits.length > 0 ? `Fits ${choice.fits.join(', ')}` : ''}</span>
    </button>
  )
}

/**
 * Names a category: "New category…" from a dash's menu (creates it and moves the dash in) or
 * Rename on a category's own menu. Says what is wrong with a name before it is sent.
 */
export function CategoryNameDialog({
  title,
  message,
  confirmLabel,
  initialName = '',
  renaming = null,
  categories,
  onCancel,
  onConfirm,
}: {
  title: string
  message?: string
  confirmLabel: string
  initialName?: string
  /** The category being renamed; its own name (in any casing) is not "taken". */
  renaming?: string | null
  categories: DashCategoryLists
  onCancel: () => void
  onConfirm: (name: string) => void
}) {
  const [name, setName] = useState(initialName)
  const unchanged = renaming !== null && name.trim() === renaming
  const problem = dashCategoryNameProblem(name, categories, renaming)
  // An empty field is not an error yet; it only keeps the button off.
  const shownProblem = name.trim().length > 0 ? problem : null

  return (
    <ContentDialog
      title={title}
      className="dashes-category-dialog"
      onCancel={onCancel}
      onSubmit={(event) => {
        event.preventDefault()
        if (unchanged) onCancel()
        else if (problem === null) onConfirm(name.trim())
      }}
      footer={
        <>
          <button type="submit" className="button primary" disabled={problem !== null && !unchanged}>
            {confirmLabel}
          </button>
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
        </>
      }
    >
      {message && <p className="content-dialog-text">{message}</p>}
      <label className="dashes-field">
        <span className="dashes-field-label">Name</span>
        <input value={name} autoFocus aria-invalid={shownProblem !== null} onChange={(event) => setName(event.target.value)} />
        {shownProblem && <span className="field-error">{shownProblem}</span>}
      </label>
    </ContentDialog>
  )
}
