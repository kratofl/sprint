import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import { matchSuggestions } from './suggestions'

type Placement = { left: number; top: number; width: number }

/**
 * Fluent AutoSuggestBox (the deleted Avalonia `SuggestingField`): a text box that stays free to
 * type in, with a list of values Sprint already knows under it. Clicking the box or its chevron,
 * or Alt/Arrow Down, lists every value; typing narrows the list to matches. Arrow keys move,
 * Enter picks, Escape closes the list (and only the list — see ContentDialog), Tab leaves.
 *
 * Not a closed list: a value nobody has recorded yet is a normal thing to plan for. And the
 * chevron only exists when there is something to list — one over an empty list promises a menu
 * that never appears.
 */
export function SuggestBox({
  value,
  onChange,
  suggestions,
  placeholder,
  disabled = false,
  autoFocus = false,
}: {
  value: string
  onChange: (value: string) => void
  suggestions: readonly string[]
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
}) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  // `all` lists every value (opened by click/chevron/arrow); `matching` follows the typed text.
  const [listing, setListing] = useState<'closed' | 'all' | 'matching'>('closed')
  const [active, setActive] = useState(-1)
  const [placement, setPlacement] = useState<Placement | null>(null)

  const shown = listing === 'all' ? [...suggestions] : matchSuggestions(suggestions, value)
  const expanded = !disabled && listing !== 'closed' && shown.length > 0 && placement !== null

  const place = () => {
    const box = inputRef.current?.getBoundingClientRect()
    if (box) setPlacement({ left: box.left, top: box.bottom + 4, width: box.width })
  }

  const open = (mode: 'all' | 'matching') => {
    place()
    setListing(mode)
    setActive(mode === 'all' ? suggestions.findIndex((option) => option === value) : -1)
  }

  const close = () => {
    setListing('closed')
    setActive(-1)
  }

  const pick = (option: string) => {
    onChange(option)
    close()
  }

  // The list is placed once from the box's rect; anything that would move the box closes it
  // instead of leaving it floating where the box used to be.
  useEffect(() => {
    if (listing === 'closed') return
    const onMove = (event: Event) => {
      if (event.target instanceof Node && listRef.current?.contains(event.target)) return
      close()
    }
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [listing])

  useEffect(() => {
    if (active < 0) return
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (!expanded) open('all')
        else setActive(Math.min(active + 1, shown.length - 1))
        return
      case 'ArrowUp':
        if (!expanded) return
        event.preventDefault()
        setActive(Math.max(active - 1, 0))
        return
      case 'Enter': {
        // Only a highlighted value is picked; otherwise Enter stays the form's own action.
        const option = expanded && active >= 0 ? shown[active] : undefined
        if (option === undefined) return
        event.preventDefault()
        pick(option)
        return
      }
      case 'Escape':
        if (!expanded) return
        event.preventDefault()
        close()
        return
      case 'Tab':
        close()
        return
    }
  }

  return (
    <span className="suggest-box">
      <input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(event) => {
          onChange(event.target.value)
          open('matching')
        }}
        onClick={() => {
          if (!expanded) open('all')
        }}
        onKeyDown={onKeyDown}
        onBlur={close}
      />
      {suggestions.length > 0 && !disabled && (
        <button
          type="button"
          className="suggest-box-toggle"
          tabIndex={-1}
          aria-label="Show suggestions"
          // Keeps focus in the text box, so opening the list never blurs (and closes) it.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (expanded) {
              close()
              return
            }
            inputRef.current?.focus()
            open('all')
          }}
        >
          <ChevronDown />
        </button>
      )}
      {expanded && (
        <ul ref={listRef} id={listId} role="listbox" className="menu-flyout suggest-list" style={{ left: placement.left, top: placement.top, width: placement.width }}>
          {shown.map((option, index) => (
            <li
              key={option}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={option === value}
              className={index === active ? 'menu-item selected' : 'menu-item'}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => pick(option)}
            >
              <span className="menu-item-label">{option}</span>
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}
