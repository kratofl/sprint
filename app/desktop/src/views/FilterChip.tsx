import { useRef, useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { MenuLayer } from './DashesMenus'
import type { MenuAnchor } from './DashesMenus'
import './SetupsView.css'

/**
 * One filter of a list (Setups, Analysis): "+ Class" while any is fine, "Class: Hypercar" once
 * narrowed; a menu of the choices with how many items each has. Styles live with Setups, its
 * first user.
 */
export function FilterChip({
  label,
  choices,
  chosen,
  onToggle,
  onClear,
}: {
  label: string
  /** What the list holds for this filter, in the order to offer them. */
  choices: ReadonlyArray<{ value: string; count: number }>
  chosen: readonly string[]
  onToggle: (value: string) => void
  onClear: () => void
}) {
  const [menuAt, setMenuAt] = useState<MenuAnchor | null>(null)
  const button = useRef<HTMLButtonElement | null>(null)
  const close = () => {
    setMenuAt(null)
    button.current?.focus()
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`setups-chip${chosen.length > 0 ? ' active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={menuAt !== null}
        disabled={choices.length === 0}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          setMenuAt({ x: box.left, y: box.bottom + 4 })
        }}
      >
        {chosen.length === 0 ? (
          <>
            <Plus /> {label}
          </>
        ) : (
          <>
            {label}: {chosen.length === 1 ? chosen[0] : `${chosen.length} picked`}
          </>
        )}
      </button>
      {menuAt && (
        <MenuLayer anchor={menuAt} label={label} width={260} onClose={close}>
          <div className="setups-menu-scroll">
            {choices.map((choice) => {
              const on = chosen.includes(choice.value)
              return (
                <button
                  key={choice.value}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={on}
                  className="menu-item"
                  onClick={() => onToggle(choice.value)}
                >
                  <span className="setups-menu-check">{on && <Check />}</span>
                  <span className="setups-menu-label">{choice.value}</span>
                  <span className="setups-menu-count tabular">{choice.count}</span>
                </button>
              )
            })}
          </div>
          {chosen.length > 0 && (
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                onClear()
                close()
              }}
            >
              <span className="setups-menu-check">
                <X />
              </span>
              Any {label.toLowerCase()}
            </button>
          )}
        </MenuLayer>
      )}
    </>
  )
}
