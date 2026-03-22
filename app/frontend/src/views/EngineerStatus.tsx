import { useState } from 'react'

export default function EngineerStatus() {
  const [connected] = useState(false)

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Race Engineer</h1>
        <span className={[
          'rounded-full px-2.5 py-0.5 text-xs font-medium',
          connected
            ? 'bg-teal/15 text-teal border border-teal-border'
            : 'bg-bg-elevated text-text-muted border border-border-glass',
        ].join(' ')}>
          {connected ? 'Engineer Online' : 'No Engineer'}
        </span>
      </div>

      {/* Connection info */}
      <div className="glass rounded-lg p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-3">Connection</p>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Local address</span>
            <span className="tabular text-text-primary font-mono text-xs">ws://192.168.1.x:9090</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Engineers connected</span>
            <span className="tabular text-text-primary">0</span>
          </div>
        </div>
      </div>

      {/* Target lap */}
      <div className="glass rounded-lg p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-3">Delta Target</p>
        <div className="flex items-center justify-between">
          <span className="text-2xl font-semibold tabular text-teal font-mono">—:---.---</span>
          <button className="rounded-md border border-teal-border px-3 py-1.5 text-xs text-teal hover:bg-teal/10 transition-colors">
            Clear Target
          </button>
        </div>
        <p className="mt-2 text-xs text-text-muted">
          Press the target button on the wheel to set from last valid lap.
        </p>
      </div>

      {/* Message log */}
      <div className="glass flex-1 rounded-lg p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-3">Engineer Messages</p>
        <div className="space-y-1 text-xs text-text-muted italic">
          <p>No messages yet.</p>
        </div>
      </div>
    </div>
  )
}
