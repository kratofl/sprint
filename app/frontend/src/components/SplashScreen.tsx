import { useEffect, useState } from 'react'
import { cn } from '@sprint/ui'

const STATUS_STEPS = ['INITIALISING...', 'LOADING MODULES...', 'READY'] as const

interface SplashScreenProps {
  /** When false, the overlay fades out and calls onDone when the transition ends. */
  visible: boolean
  /** Called after the fade-out transition completes — use to unmount this component. */
  onDone: () => void
}

export default function SplashScreen({ visible, onDone }: SplashScreenProps) {
  const [statusIdx, setStatusIdx] = useState(0)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setStatusIdx(1), 700)
    const t2 = setTimeout(() => setStatusIdx(2), 1300)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  useEffect(() => {
    if (!visible) setFading(true)
  }, [visible])

  return (
    <>
      <style>{`
        @keyframes splash-fill {
          from { width: 0% }
          to   { width: 100% }
        }
        .splash-bar { animation: splash-fill 1.4s ease-in-out forwards; }
      `}</style>

      <div
        onTransitionEnd={() => { if (fading) onDone() }}
        className={cn(
          'fixed inset-0 z-50 flex flex-col items-center justify-center bg-background',
          'transition-opacity duration-500',
          fading ? 'pointer-events-none opacity-0' : 'opacity-100',
        )}
      >
        <h1 className="terminal-header text-5xl font-bold italic tracking-[0.2em] text-primary">
          SPRINT
        </h1>
        <p className="mt-2 font-mono text-[10px] tracking-[0.4em] text-text-muted">
          TELEMETRY SYSTEM
        </p>

        <div className="mt-10 h-px w-64 overflow-hidden bg-border">
          <div className="splash-bar h-full bg-primary" />
        </div>

        <p className="mt-3 font-mono text-[10px] tracking-widest text-text-muted">
          {STATUS_STEPS[statusIdx]}
        </p>
      </div>
    </>
  )
}
