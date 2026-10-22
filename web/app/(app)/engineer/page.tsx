'use client'

import { useState } from 'react'
import { IconMessage2 } from '@tabler/icons-react'
import Page from '@/components/Page'
import { Card, EmptyState } from '@/components/Card'

const CAPABILITIES = ['Target lap updates', 'Dash parameter overrides', 'Pit note annotations'] as const

// Remote race engineer. Joining is a local preview: the web app has no live
// link yet, so a joined session waits for driver telemetry.
export default function Engineer() {
  const [code, setCode] = useState('')
  const [joined, setJoined] = useState(false)

  return (
    <Page title="Race engineer">
      {joined ? (
        <div className="split-row">
          <Card
            title="Live session"
            action={
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => setJoined(false)}>
                Leave session
              </button>
            }
          >
            <span className="status" data-status="paused">Waiting for driver</span>
            <div className="kpi">
              <span className="kpi-label">Target lap</span>
              <span className="kpi-value" data-empty="true" aria-label="No data">—</span>
              <span className="kpi-caption">Appears once the driver is on track</span>
            </div>
          </Card>
          <Card title="Command feed">
            <EmptyState
              icon={IconMessage2}
              title="No commands yet"
              body="Commands you send and the driver's replies appear here."
            />
          </Card>
        </div>
      ) : (
        <div className="split-row">
          <Card title="Join a session">
            <form
              className="join-form"
              onSubmit={(event) => {
                event.preventDefault()
                if (code.trim()) setJoined(true)
              }}
            >
              <p className="muted">Paste a driver&apos;s invite code or shared engineer link to open the live feed.</p>
              <label className="field">
                Session code
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="sprint://engineer/spa-night-stint"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <button type="submit" className="btn btn-primary" disabled={!code.trim()}>
                Join session
              </button>
            </form>
          </Card>
          <Card title="What you can do">
            {CAPABILITIES.map((capability) => (
              <div key={capability} className="list-row">
                <span className="list-row-title">{capability}</span>
              </div>
            ))}
          </Card>
        </div>
      )}
    </Page>
  )
}
