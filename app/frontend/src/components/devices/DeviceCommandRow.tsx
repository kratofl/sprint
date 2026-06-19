import { Button, KeyChip, SettingsRow, cn } from '@sprint/ui'
import type { CommandMeta } from '@/lib/controls'
import { formatCommandIdForDisplay } from '@/lib/controls/commandIdDisplay'

interface DeviceCommandRowProps {
  cmd: CommandMeta
  button: number
  bound: boolean
  listening: boolean
  onListenToggle: () => void
  onCancelListen: () => void
  onButtonChange: (button: number) => void
}

export function DeviceCommandRow({
  cmd,
  button,
  bound,
  listening,
  onListenToggle,
  onCancelListen,
  onButtonChange,
}: DeviceCommandRowProps) {
  return (
    <SettingsRow
      className={cn(
        'rounded-[calc(var(--r)-2px)] border border-[var(--line)] border-b-0 bg-[var(--panel)]',
        (bound || listening) && 'border-[var(--accent)] bg-[rgba(255,106,0,.08)]',
      )}
    >
      <div className="flex flex-col gap-0.5">
        <span className={cn('font-sans text-[12px] font-bold', bound ? 'text-[var(--text)]' : 'text-[var(--muted)]')}>
          {cmd.label}
        </span>
        <span className="font-sans text-[10px] text-[var(--muted)] opacity-60">{formatCommandIdForDisplay(cmd.id)}</span>
      </div>
      <div className="ml-4 flex flex-shrink-0 items-center gap-2">
        {bound && !listening ? (
          <KeyChip>BTN {button}</KeyChip>
        ) : null}
        {bound && !listening ? (
          <Button
            onClick={() => onButtonChange(0)}
            variant="destructive"
            size="icon-xs"
            className="h-5 w-5 p-0 text-[13px]"
            title="Clear binding"
            aria-label={`Clear binding for ${cmd.label}`}
          >
            x
          </Button>
        ) : null}
        {listening ? (
          <>
            <KeyChip className="border-[var(--accent)] text-[var(--accent)]">Press a button...</KeyChip>
            <Button variant="ghost" size="sm" onClick={onCancelListen}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="secondary" size="sm" onClick={onListenToggle}>
            Assign
          </Button>
        )}
      </div>
    </SettingsRow>
  )
}
