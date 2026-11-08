import { useState } from 'react'
import { Check, Pencil } from 'lucide-react'

/**
 * A name shown as a page's 20px heading, renamed in place: the pen swaps it for an input in the
 * same type with a tick beside it. Enter or the tick saves, Escape puts the name back, and so
 * does saving it empty or unchanged. `onRename` gets the trimmed new name. Used by a device's
 * page and the dash designer's Settings.
 */
export function InlineName({ name, label, onRename }: { name: string; label: string; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)

  if (draft === null) {
    return (
      <div className="inline-name">
        <h2 className="inline-name-text">{name}</h2>
        <button type="button" className="icon-button inline-name-button" aria-label="Rename" title="Rename" onClick={() => setDraft(name)}>
          <Pencil size={16} />
        </button>
      </div>
    )
  }

  const save = (): void => {
    const trimmed = draft.trim()
    if (trimmed.length > 0 && trimmed !== name) onRename(trimmed)
    setDraft(null)
  }

  return (
    <form
      className="inline-name"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <input
        className="inline-name-input"
        aria-label={label}
        value={draft}
        autoFocus
        onFocus={(event) => event.target.select()}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            setDraft(null)
          }
        }}
      />
      <button type="submit" className="icon-button inline-name-button" aria-label="Save name" title="Save">
        <Check size={16} />
      </button>
    </form>
  )
}
