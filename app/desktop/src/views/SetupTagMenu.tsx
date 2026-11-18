import { useRef, useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { MenuLayer, type MenuAnchor } from '../shell/Menu'
import type { SetupItem, SetupSession, SetupStyle, SetupTagValue } from './SetupsDomain'
import { SessionChip } from './SessionChip'

const SESSIONS: readonly SetupSession[] = ['Quali', 'Race']
const STYLES: readonly SetupStyle[] = ['Esport', 'Safe', 'Wet']

/**
 * A setup's session as a button that tags it: the session chip, or a dashed "+ Tag" while the
 * setup has none. The menu sets the session and the style the driver says it is for; picking the
 * ticked one again unticks it (still the driver's tag, so a Bealien name's own tags stay hidden),
 * and "Clear tags" drops the driver's tag so the name's show again. Raises intent only: `onTag`
 * sends the command.
 */
export function SetupTagButton({ setup, onTag }: { setup: SetupItem; onTag: (tag: SetupTagValue) => void }) {
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null)
  const button = useRef<HTMLButtonElement | null>(null)
  const close = () => {
    setAnchor(null)
    button.current?.focus()
  }
  const pick = (tag: SetupTagValue) => {
    onTag(tag)
    close()
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className="setups-tag-button"
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        aria-label={`Tag ${setup.name}`}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          setAnchor({ x: box.left, y: box.bottom + 4 })
        }}
      >
        {setup.session ? (
          <SessionChip kind={setup.session} />
        ) : (
          <span className="setups-tag-add">
            <Plus /> Tag
          </span>
        )}
      </button>
      {anchor && (
        <MenuLayer anchor={anchor} label={`Tag ${setup.name}`} width={200} onClose={close}>
          <span className="setups-menu-section">Session</span>
          {SESSIONS.map((session) => (
            <TagItem key={session} label={session} checked={setup.session === session} onPick={() => pick({ session: setup.session === session ? null : session, style: setup.style })} />
          ))}
          <span className="setups-menu-section">Style</span>
          {STYLES.map((style) => (
            <TagItem key={style} label={style} checked={setup.style === style} onPick={() => pick({ session: setup.session, style: setup.style === style ? null : style })} />
          ))}
          {setup.taggedByDriver && (
            <>
              <div className="menu-separator" role="separator" />
              <button type="button" role="menuitem" className="menu-item" onClick={() => pick(null)}>
                <span className="setups-menu-check" />
                Clear tags
              </button>
            </>
          )}
        </MenuLayer>
      )}
    </>
  )
}

function TagItem({ label, checked, onPick }: { label: string; checked: boolean; onPick: () => void }) {
  return (
    <button type="button" role="menuitemcheckbox" aria-checked={checked} className="menu-item" onClick={onPick}>
      <span className="setups-menu-check">{checked && <Check />}</span>
      {label}
    </button>
  )
}
