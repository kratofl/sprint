import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Search } from 'lucide-react'
import { filterCommands, type ShellCommand } from './commands'

// Ctrl+K palette (old app: `OpenCommandPalette`), opened from the title-bar
// search box as an acrylic flyout right under it. Type to filter, arrows to move,
// Enter to run; clicking outside closes it. Escape is handled by the shared shell keydown listener in App.tsx
// so it can close whichever transient surface (palette, toast) is topmost.
export function CommandPalette({ commands, onClose }: { commands: ShellCommand[]; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => filterCommands(commands, query), [commands, query])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setSelected(0)
  }, [query])

  const run = (command: ShellCommand): void => {
    onClose()
    command.run()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelected((current) => (results.length === 0 ? 0 : (current + 1) % results.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelected((current) => (results.length === 0 ? 0 : (current - 1 + results.length) % results.length))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const command = results[selected]
      if (command) run(command)
    }
  }

  return (
    <div
      className="command-palette-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="command-palette-search">
          <Search size={13} strokeWidth={1.8} aria-hidden="true" />
          <input
            ref={inputRef}
            className="command-palette-input"
            type="text"
            placeholder="Search commands and pages"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={results[selected] ? `command-${results[selected].id}` : undefined}
          />
        </div>
        <div className="command-palette-list" id="command-palette-list" role="listbox">
          {results.length === 0 ? (
            <p className="command-palette-empty">No matching commands</p>
          ) : (
            results.map((command, index) => (
              <button
                key={command.id}
                id={`command-${command.id}`}
                type="button"
                role="option"
                aria-selected={index === selected}
                className={index === selected ? 'command-palette-item selected' : 'command-palette-item'}
                onMouseEnter={() => setSelected(index)}
                onClick={() => run(command)}
              >
                <span>{command.label}</span>
                {command.shortcut ? <span className="command-palette-shortcut">{command.shortcut}</span> : null}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
