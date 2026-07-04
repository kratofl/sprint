const widgets = ['LAP_DELTA', 'GEAR', 'RPM_BAR', 'SHIFT_LIGHTS', 'FUEL_REMAINING', 'TIRE_TEMP'] as const

const properties = [
  ['SCREEN_TARGET', 'VoCore M-PRO'],
  ['CANVAS', '800x480'],
  ['ACTIVE_LAYOUT', 'GT3_NIGHT_STINT'],
  ['BRIGHTNESS', '82%'],
] as const

export default function DashEditor() {
  return (
    <section className="space-y-[14px]">
      <header className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
        <div className="flex flex-wrap items-center justify-between gap-[14px]">
          <div>
            <p className="font-saira text-[11px] uppercase tracking-[.12em] text-[var(--muted)]">Sprint</p>
            <h1 className="font-inter text-[13px] font-bold text-[var(--text)]">Dash Editor</h1>
            <p className="mt-1 font-inter text-[11px] text-[var(--muted)]">
              Compose VoCore wheel layouts before the desktop app pushes them to hardware.
            </p>
          </div>
          <button className="h-[25px] rounded-control border border-[var(--orange)] bg-[var(--orange)] px-[14px] py-[6px] font-inter text-[13px] font-bold text-[#141414]">
            SAVE_LAYOUT
          </button>
        </div>
      </header>

      <div className="grid gap-[14px] xl:grid-cols-[240px_minmax(0,1fr)_280px]">
        <section className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
          <p className="font-inter text-[13px] font-bold text-[var(--text)]">WIDGET_PALETTE</p>
          <div className="mt-[14px] space-y-[10px]">
            {widgets.map((widget) => (
              <div key={widget} className="flex h-[46px] items-center justify-between rounded-alert border border-[var(--border-2)] bg-[var(--panel-3)] p-2">
                <span className="font-inter text-[11px] font-bold text-[var(--muted)]">{widget}</span>
                <span className="rounded-[4px] border border-[var(--orange)] px-[10px] py-1 font-saira-sc text-[12px] font-bold text-[var(--orange)]">
                  READY
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
          <div className="flex items-center justify-between gap-[14px]">
            <p className="font-inter text-[13px] font-bold text-[var(--text)]">DASH_CANVAS</p>
            <span className="rounded-[4px] border border-[var(--green)] px-[10px] py-1 font-saira-sc text-[12px] font-bold text-[var(--green)]">
              30HZ_TARGET
            </span>
          </div>
          <div className="mt-[14px] aspect-[5/3] w-full rounded-panel border border-[var(--border)] bg-[var(--bg)] p-[14px]">
            <div className="flex h-full flex-col justify-between">
              <div className="grid grid-cols-[1fr_auto_1fr] gap-[14px]">
                <div>
                  <p className="font-saira text-[11px] uppercase tracking-[.12em] text-[var(--muted)]">Delta</p>
                  <p className="font-saira text-[34px] font-bold tabular-nums text-[var(--green)]">-0.184</p>
                </div>
                <div className="text-center">
                  <p className="font-saira text-[11px] uppercase tracking-[.12em] text-[var(--muted)]">Gear</p>
                  <p className="font-saira text-[56px] font-bold tabular-nums text-[var(--text)]">5</p>
                </div>
                <div className="text-right">
                  <p className="font-saira text-[11px] uppercase tracking-[.12em] text-[var(--muted)]">Fuel</p>
                  <p className="font-saira text-[34px] font-bold tabular-nums text-[var(--orange)]">32.4L</p>
                </div>
              </div>
              <div className="space-y-[10px]">
                <div className="h-2 rounded-full bg-[var(--panel-3)]">
                  <div className="h-full w-[78%] rounded-full bg-[var(--orange)]" />
                </div>
                <div className="grid grid-cols-4 gap-[10px]">
                  {['LF 84', 'RF 86', 'LR 82', 'RR 83'].map((corner) => (
                    <div key={corner} className="rounded-[6px] border border-[var(--border)] bg-[var(--panel)] p-2 text-center">
                      <p className="font-saira text-[12px] tabular-nums text-[var(--muted)]">{corner}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
          <p className="font-inter text-[13px] font-bold text-[var(--text)]">PROPERTIES</p>
          <div className="mt-[14px] space-y-[10px]">
            {properties.map(([label, value]) => (
              <div key={label} className="rounded-alert border border-[var(--border)] bg-[var(--panel-2)] p-[10px]">
                <p className="font-saira text-[11px] uppercase tracking-[.12em] text-[var(--muted)]">{label}</p>
                <p className="mt-1 font-inter text-[13px] text-[var(--text)]">{value}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  )
}
