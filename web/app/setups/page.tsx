const setups = [
  ['SPA_WET_SAFE', 'McLaren 720S GT3 EVO', 'Spa-Francorchamps', 'krato', '2:15.482', ['WET', 'ENDURANCE']],
  ['MONZA_QUALI_V3', 'Ferrari 296 GT3', 'Monza', 'Marco', '1:47.931', ['LOW_DRAG', 'QUALI']],
  ['IMOLA_RACE_BASE', 'BMW M4 GT3', 'Imola', 'krato', '1:41.267', ['STINT', 'SAFE_REARS']],
  ['BATHURST_NIGHT', 'Audi R8 LMS Evo II', 'Mount Panorama', 'Nina', '2:03.908', ['NIGHT', 'CURB_SAFE']],
] as const

export default function Setups() {
  return (
    <section className="space-y-[14px]">
      <header className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
        <p className="font-saira text-[11px] uppercase tracking-[.12em] text-[var(--muted)]">Sprint</p>
        <h1 className="font-inter text-[13px] font-bold text-[var(--text)]">Setups</h1>
        <p className="mt-1 font-inter text-[11px] text-[var(--muted)]">
          Track-tested car baselines synchronized from desktop and collaborators.
        </p>
      </header>

      <div className="grid gap-[14px] md:grid-cols-2 2xl:grid-cols-3">
        {setups.map(([name, car, track, author, lap, tags]) => (
          <article key={name} className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
            <p className="font-inter text-[13px] font-bold text-[var(--text)]">{name}</p>
            <p className="mt-1 font-inter text-[11px] text-[var(--muted)]">{car} / {track}</p>
            <div className="mt-[14px] grid grid-cols-2 gap-[14px]">
              <div>
                <p className="font-saira text-[11px] uppercase tracking-[.12em] text-[var(--muted)]">Author</p>
                <p className="font-inter text-[13px] text-[var(--text)]">{author}</p>
              </div>
              <div>
                <p className="font-saira text-[11px] uppercase tracking-[.12em] text-[var(--muted)]">Ref Lap</p>
                <p className="font-saira text-[18px] font-bold tabular-nums text-[var(--orange)]">{lap}</p>
              </div>
            </div>
            <div className="mt-[14px] flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span key={tag} className="rounded-[4px] border border-[var(--border)] px-[10px] py-1 font-saira-sc text-[12px] font-bold text-[var(--muted)]">
                  {tag}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
