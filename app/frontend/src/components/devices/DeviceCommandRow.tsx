import { useEffect, useRef, useState } from 'react'
import { Badge, Button, cn } from '@sprint/ui'
import type { CommandMeta } from '@/lib/controls'
import { controlsAPI } from '@/lib/controls'
import { formatCommandIdForDisplay } from '@/lib/controls/commandIdDisplay'

type DeviceCaptureState = 'idle' | 'capturing' | 'timeout'

interface DeviceCommandRowProps {
  cmd: CommandMeta
  button: number
  bound: boolean
  onButtonChange: (button: number) => void
}

export function DeviceCommandRow({ cmd, button, bound, onButtonChange }: DeviceCommandRowProps) {
  const [captureState, setCaptureState] = useState<DeviceCaptureState>('idle')
  const [countdown, setCountdown] = useState(3)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const handleCapture = async () => {
    if (captureState === 'capturing') return
    setCaptureState('capturing')
    setCountdown(3)
    timerRef.current = setInterval(() => {
      setCountdown(previous => {
        if (previous <= 1) {
          clearTimer()
          return 0
        }
        return previous - 1
      })
    }, 1000)

    try {
      const nextButton = await controlsAPI.captureButton(3)
      clearTimer()
      onButtonChange(nextButton)
      setCaptureState('idle')
    } catch {
      clearTimer()
      setCaptureState('timeout')
      setTimeout(() => setCaptureState('idle'), 1200)
    }
  }

  useEffect(() => () => clearTimer(), [])

  return (
    <div className={cn(
      'flex items-center justify-between gap-[10px] rounded-alert border border-[var(--border)] bg-[var(--panel)] p-[10px]',
      bound
        ? 'border-[var(--orange)]'
        : 'hover:border-[var(--border-2)]',
    )}>
        <div className="flex flex-col gap-0.5">
          <span className={cn('font-saira text-[12px] font-bold', bound ? 'text-[var(--text)]' : 'text-[var(--muted)]')}>
            {cmd.label}
          </span>
        <span className="font-saira text-[10px] text-[var(--muted)] opacity-60">{formatCommandIdForDisplay(cmd.id)}</span>
        </div>
      <div className="ml-4 flex flex-shrink-0 items-center gap-2">
        {bound ? (
          <Badge variant="active" className="ui-label">BTN_{button}</Badge>
        ) : null}
        {bound ? (
          <Button
            onClick={() => onButtonChange(0)}
            variant="destructive"
            size="icon-xs"
            className="h-5 w-5 p-0 text-[13px]"
            title="Clear binding"
            aria-label={`Clear binding for ${cmd.label}`}
          >
            ×
          </Button>
        ) : null}
        <Button
          variant={
            captureState === 'capturing'
              ? 'ghost'
              : captureState === 'timeout'
                ? 'destructive'
                : 'secondary'
          }
          size="sm"
          disabled={captureState === 'capturing'}
          onClick={handleCapture}
          className="ui-label h-8 w-20 rounded-control font-bold text-[11px]"
        >
          {captureState === 'capturing'
            ? `LISTENING_${countdown}`
            : captureState === 'timeout'
              ? 'No input'
              : 'Capture'}
        </Button>
      </div>
    </div>
  )
}
