'use client'

import { useState } from 'react'

const queuedCommands = [
  ['16:41Z', 'TARGET_LAP set from reference', 'Lap 12 / 2:15.482 / Applied'],
  ['16:39Z', 'BRAKE_BIAS +0.3%', 'Pending driver acknowledgment'],
  ['16:36Z', 'FUEL_TARGET -2.0L', 'Rejected by desktop authority'],
] as const

const remoteLinks = ['TARGET_LAP updates', 'Dash parameter overrides', 'Pit note annotations'] as const

export default function Engineer() {
  const [connected, setConnected] = useState(false)

  return (
    <section className="space-y-[14px]">
      <header className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
        <div className="flex flex-wrap items-center justify-between gap-[14px]">
          <div>
            <p className="font-saira text-[11px] uppercase tracking-[.12em] text-[var(--muted)]">Sprint</p>
            <h1 className="font-inter text-[13px] font-bold text-[var(--text)]">Race Engineer</h1>
            <p className="mt-1 font-inter text-[11px] text-[var(--muted)]">
              Remote telemetry link with desktop-authoritative command handling.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setConnected((value) => !value)}
            className="h-[25px] rounded-control border border-[var(--orange)] bg-[var(--orange)] px-[14px] py-[6px] font-inter text-[13px] font-bold text-[#141414]"
          >
            {connected ? 'DISCONNECT' : 'JOIN_PREVIEW'}
          </button>
        </div>
      </header>

      {!connected ? (
        <div className="grid gap-[14px] xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
            <p className="font-inter text-[13px] font-bold text-[var(--text)]">JOIN_REMOTE_SESSION</p>
            <p className="mt-1 font-inter text-[11px] text-[var(--muted)]">
              Paste a driver invite code or shared engineer link to open the live feed.
            </p>
            <label htmlFor="session-code" className="mt-[14px] block font-inter text-[11px] text-[var(--muted)]">
              SESSION_CODE
            </label>
            <input
              id="session-code"
              placeholder="sprint://engineer/spa-night-stint"
              className="mt-2 h-8 w-full rounded-control border border-[var(--border)] bg-[var(--panel-2)] px-[10px] font-inter text-[13px] text-[var(--text)] outline-none focus:border-[var(--orange)]"
            />
          </section>

          <section className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
            <p className="font-inter text-[13px] font-bold text-[var(--text)]">REMOTE_CAPABILITIES</p>
            <div className="mt-[14px] space-y-[10px]">
              {remoteLinks.map((item) => (
                <div key={item} className="rounded-alert border border-[var(--border)] bg-[var(--panel-2)] p-[10px]">
                  <p className="font-inter text-[11px] text-[var(--muted)]">{item}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div className="grid gap-[14px] xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
            <p className="font-inter text-[13px] font-bold text-[var(--text)]">TARGET_LAP</p>
            <p className="mt-[14px] font-saira text-[34px] font-bold tabular-nums text-[var(--orange)]">2:15.482</p>
            <p className="font-inter text-[11px] text-[var(--muted)]">Lap 12 / Spa / Track valid</p>
          </section>
          <section className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
            <p className="font-inter text-[13px] font-bold text-[var(--text)]">COMMAND_FEED</p>
            <div className="mt-[14px] space-y-[10px]">
              {queuedCommands.map(([time, title, detail]) => (
                <div key={`${time}-${title}`} className="rounded-alert border border-[var(--border)] bg-[var(--panel-2)] p-[10px]">
                  <p className="font-saira text-[12px] tabular-nums text-[var(--orange)]">{time}</p>
                  <p className="mt-1 font-inter text-[13px] font-bold text-[var(--text)]">{title}</p>
                  <p className="mt-1 font-inter text-[11px] text-[var(--muted)]">{detail}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
