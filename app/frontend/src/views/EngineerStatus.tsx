import { useState } from 'react'
import { Badge, Button, LapTime } from '@sprint/ui'

export default function EngineerStatus() {
  const [connected] = useState(false)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">

      {/* Section header */}
      <div className="border-b border-border p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="terminal-header mb-1 text-sm font-bold tracking-[0.2em]">
              ENGINEER_HUB
            </h2>
            <p className="font-mono text-[10px] text-text-muted">
              STATUS: {connected ? 'ENGINEER_ONLINE' : 'AWAITING_CONNECTION'}
            </p>
          </div>
          <Badge variant={connected ? 'connected' : 'neutral'} className="terminal-header font-mono">
            {connected ? '● ONLINE' : '○ OFFLINE'}
          </Badge>
        </div>
      </div>

      {/* Two-column body */}
      <div className="grid flex-1 grid-cols-2 overflow-hidden">

        {/* Left: connection details */}
        <div className="flex flex-col border-r border-border">
          <div className="border-b border-border p-4">
            <h4 className="terminal-header mb-3 text-[10px] font-bold text-text-muted">
              LINK_CONFIG
            </h4>
            <div className="space-y-3 font-mono text-[10px]">
              <div className="flex items-center justify-between">
                <span className="text-text-muted">LOCAL_ADDR</span>
                <span>ws://192.168.1.x:9090</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">ENGINEERS</span>
                <span>0</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">PROTOCOL</span>
                <span>WEBSOCKET_V2</span>
              </div>
            </div>
          </div>

          <div className="p-4">
            <h4 className="terminal-header mb-3 text-[10px] font-bold text-text-muted">
              DELTA_TARGET
            </h4>
            <div className="flex items-center justify-between">
              <LapTime seconds={undefined} className="font-mono text-2xl font-bold text-secondary" />
              <Button variant="active" size="sm" className="terminal-header">
                CLEAR_TARGET
              </Button>
            </div>
            <p className="mt-2 font-mono text-[9px] text-text-muted">
              Press wheel button to set from last valid lap.
            </p>
          </div>
        </div>

        {/* Right: message log */}
        <div className="flex flex-col overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h4 className="terminal-header text-[10px] font-bold text-text-muted">
              MESSAGE_LOG
            </h4>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-1 font-mono text-[9px] text-text-muted">
              <p>AWAITING_MESSAGES...</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
