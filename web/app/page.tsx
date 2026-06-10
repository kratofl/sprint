import Link from 'next/link'
import {
  IconAdjustmentsHorizontal,
  IconArrowRight,
  IconHeadset,
  IconHistory,
  IconLayout,
} from '@tabler/icons-react'

const overview = [
  ['RECORDED_SESSIONS', '18', '+6 vs last week', IconHistory],
  ['ACTIVE_SETUPS', '42', '12 synced from desktop', IconAdjustmentsHorizontal],
  ['CONNECTED_ENGINEERS', '3', 'Fastest RTT 38ms', IconHeadset],
] as const

const quickAccess = [
  ['/sessions', 'SESSION_LIBRARY', 'Review recorded laps and sector trends.', IconHistory],
  ['/engineer', 'ENGINEER_LINK', 'Open the remote engineer command console.', IconHeadset],
  ['/setups', 'SETUP_BANK', 'Track-tested car setup baselines.', IconAdjustmentsHorizontal],
  ['/dash', 'DASH_EDITOR', 'Compose VoCore widgets for wheel display.', IconLayout],
] as const

const activity = [
  ['16:42Z', 'TARGET_LAP refreshed from wheel button', 'Spa / McLaren 720S GT3 / Reference set to 2:15.482'],
  ['16:31Z', 'ENGINEER command accepted', 'Brake bias +0.3% applied from Marco over remote link'],
  ['16:12Z', 'SETUP synced from desktop', 'Monza_LowDrag_v7 uploaded to setup bank'],
  ['15:58Z', 'DASH layout published', 'GT3_NIGHT_STINT pushed to VoCore display'],
] as const

export default function Home() {
  return (
    <section className="space-y-[14px]">
      <header className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
        <div className="flex flex-wrap items-center justify-between gap-[14px]">
          <div>
            <p className="font-saira text-[11px] uppercase tracking-[.12em] text-[var(--muted)]">Sprint</p>
            <h1 className="font-inter text-[13px] font-bold text-[var(--text)]">Dashboard</h1>
            <p className="mt-1 font-inter text-[11px] text-[var(--muted)]">
              Mission control for telemetry sessions, setup sync, and remote engineer activity.
            </p>
          </div>
          <Link
            href="/engineer"
            className="inline-flex h-[25px] items-center rounded-control border border-[var(--orange)] bg-[var(--orange)] px-[14px] py-[6px] font-inter text-[13px] font-bold text-[#141414]"
          >
            OPEN_ENGINEER
          </Link>
        </div>
      </header>

      <div className="grid gap-[14px] lg:grid-cols-3">
        {overview.map(([label, value, meta, Icon]) => (
          <article key={label} className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
            <div className="flex items-start justify-between gap-[14px]">
              <div>
                <p className="font-inter text-[13px] font-bold text-[var(--text)]">{label}</p>
                <p className="mt-1 font-inter text-[11px] text-[var(--muted)]">{meta}</p>
              </div>
              <Icon className="size-4 text-[var(--muted)]" stroke={1.8} />
            </div>
            <p className="mt-[14px] font-saira text-[32px] font-bold tabular-nums text-[var(--orange)]">
              {value}
            </p>
          </article>
        ))}
      </div>

      <div className="grid gap-[14px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
          <p className="font-saira text-[11px] uppercase tracking-[.12em] text-[var(--muted)]">Quick Access</p>
          <div className="mt-[14px] grid gap-[10px] md:grid-cols-2">
            {quickAccess.map(([href, label, description, Icon]) => (
              <Link
                key={href}
                href={href}
                className="group rounded-alert border border-[var(--border)] bg-[var(--panel-2)] p-[10px]"
              >
                <div className="flex items-start justify-between gap-[10px]">
                  <Icon className="size-4 text-[var(--muted)]" stroke={1.8} />
                  <IconArrowRight className="size-[14px] text-[var(--muted)] transition-transform group-hover:translate-x-0.5" stroke={1.8} />
                </div>
                <p className="mt-[14px] font-inter text-[13px] font-bold text-[var(--text)]">{label}</p>
                <p className="mt-1 font-inter text-[11px] text-[var(--muted)]">{description}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-panel border border-[var(--border)] bg-[var(--panel)] p-[14px]">
          <p className="font-saira text-[11px] uppercase tracking-[.12em] text-[var(--muted)]">Recent Activity</p>
          <div className="mt-[14px] space-y-[10px]">
            {activity.map(([time, title, detail]) => (
              <div key={`${time}-${title}`} className="rounded-alert border border-[var(--border)] bg-[var(--panel-2)] p-[10px]">
                <div className="flex items-start gap-[10px]">
                  <span className="font-saira text-[12px] tabular-nums text-[var(--orange)]">{time}</span>
                  <div>
                    <p className="font-inter text-[13px] font-bold text-[var(--text)]">{title}</p>
                    <p className="mt-1 font-inter text-[11px] text-[var(--muted)]">{detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  )
}
