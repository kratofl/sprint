const sessions = [
  ['SPA_RAIN_STINT', 'Spa-Francorchamps', 'McLaren 720S GT3 EVO', '17', '2:15.482', 'REFERENCE'],
  ['MONZA_LOW_DRAG', 'Monza', 'Ferrari 296 GT3', '13', '1:47.931', 'READY'],
  ['IMOLA_LONG_RUN', 'Imola', 'BMW M4 GT3', '26', '1:41.267', 'STINT'],
  ['NURB_SPRINT_Q', 'Nurburgring Sprint', 'Porsche 992 GT3 R', '9', '1:27.404', 'QUALI'],
  ['BATHURST_NIGHT', 'Mount Panorama', 'Audi R8 LMS Evo II', '22', '2:03.908', 'ARCHIVE'],
] as const

export default function Sessions() {
  return (
    <section className="space-y-[14px]">
      <header className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
        <p className="font-saira text-[11px] uppercase tracking-[.12em] text-[var(--muted)]">Sprint</p>
        <h1 className="font-inter text-[13px] font-bold text-[var(--text)]">Sessions</h1>
        <p className="mt-1 font-inter text-[11px] text-[var(--muted)]">
          Recorded telemetry runs, lap references, and export-ready stints.
        </p>
      </header>

      <section className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
        <div className="flex items-center justify-between gap-[14px]">
          <p className="font-saira text-[11px] uppercase tracking-[.12em] text-[var(--muted)]">Session Library</p>
          <button className="h-[25px] rounded-control border border-[var(--border)] bg-[var(--panel-2)] px-[14px] py-[6px] font-inter text-[13px] font-bold text-[var(--text)]">
            SYNC_DESKTOP
          </button>
        </div>
        <div className="mt-[14px] space-y-[10px]">
          {sessions.map(([name, track, car, laps, best, status]) => (
            <article key={name} className="grid gap-[14px] rounded-alert border border-[var(--border)] bg-[var(--panel-2)] p-[10px] md:grid-cols-[minmax(0,1.4fr)_120px_140px_100px] md:items-center">
              <div>
                <p className="font-inter text-[13px] font-bold text-[var(--text)]">{name}</p>
                <p className="mt-1 font-inter text-[11px] text-[var(--muted)]">{track} / {car}</p>
              </div>
              <div>
                <p className="font-saira text-[11px] uppercase tracking-[.12em] text-[var(--muted)]">Laps</p>
                <p className="font-saira text-[18px] font-bold tabular-nums text-[var(--text)]">{laps}</p>
              </div>
              <div>
                <p className="font-saira text-[11px] uppercase tracking-[.12em] text-[var(--muted)]">Best Lap</p>
                <p className="font-saira text-[18px] font-bold tabular-nums text-[var(--orange)]">{best}</p>
              </div>
              <span className="w-fit rounded-[4px] border border-[var(--orange)] px-[10px] py-1 font-saira-sc text-[12px] font-bold text-[var(--orange)] md:justify-self-end">
                {status}
              </span>
            </article>
          ))}
        </div>
      </section>
    </section>
  )
}
