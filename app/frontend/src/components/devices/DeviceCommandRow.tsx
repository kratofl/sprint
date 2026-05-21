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
      'flex items-center justify-between px-3 py-2',
      bound ? 'surface-active' : 'surface-panel',
    )}>
        <div className="flex flex-col gap-0.5">
          <span className={cn('font-mono text-[11px] font-bold', bound ? 'text-white' : 'text-text-muted')}>
            {cmd.label}
          </span>
        <span className="font-mono text-[9px] text-text-muted opacity-60">{formatCommandIdForDisplay(cmd.id)}</span>
        </div>
      <div className="ml-4 flex flex-shrink-0 items-center gap-2">
        {bound ? (
          <Badge variant="active" className="terminal-header">BTN_{button}</Badge>
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
          className="terminal-header w-20 font-bold text-[9px]"
        >
          {captureState === 'capturing'
            ? `LISTENING_${countdown}`
            : captureState === 'timeout'
              ? 'NO_INPUT'
              : 'CAPTURE'}
        </Button>
      </div>
    </div>
  )
}
