'use client'

import { createContext, useContext, useId, type ComponentProps } from 'react'
import { ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts'
import { cn } from '@/lib/utils'

// Recharts wrapper for dense data (telemetry traces): a responsive container that
// styles axis text, grid and cursor with the design tokens, exposes each series'
// colour as --color-<key>, and a solid tooltip. Colours follow DESIGN.md → Charts:
// the one series the chart is about in var(--brand-500), context in
// var(--chart-muted). Hand-built SVG charts for a few points live in
// components/app/charts.tsx.
//
//   <ChartContainer config={{ speed: { label: 'Speed', color: 'var(--brand-500)' } }}>
//     <LineChart data={samples}>
//       <CartesianGrid vertical={false} />
//       <Line dataKey="speed" stroke="var(--color-speed)" dot={false} strokeWidth={2} />
//       <ChartTooltip content={<ChartTooltipContent />} />
//     </LineChart>
//   </ChartContainer>

export type ChartConfig = Record<string, { label: string; color?: string }>

const ChartContext = createContext<{ config: ChartConfig } | null>(null)

function useChart() {
  const context = useContext(ChartContext)
  if (!context) throw new Error('useChart must be used within a ChartContainer')
  return context
}

function ChartContainer({
  id,
  className,
  children,
  config,
}: Pick<ComponentProps<'div'>, 'id' | 'className'> & {
  config: ChartConfig
  children: ComponentProps<typeof ResponsiveContainer>['children']
}) {
  const uniqueId = useId()
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, '')}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        className={cn(
          'flex h-[260px] w-full justify-center text-caption',
          '[&_.recharts-cartesian-axis-tick_text]:fill-label-secondary',
          '[&_.recharts-cartesian-grid_line]:stroke-separator',
          '[&_.recharts-tooltip-cursor]:fill-fill',
          className,
        )}
      >
        <ChartStyle id={chartId} config={config} />
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

// Declares each series' colour as --color-<key> on the chart, so marks can use var(--color-<key>).
function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colorVars = Object.entries(config)
    .filter(([, item]) => item.color)
    .map(([key, item]) => `  --color-${key}: ${item.color};`)
  if (colorVars.length === 0) return null
  return <style dangerouslySetInnerHTML={{ __html: `[data-chart=${id}] {\n${colorVars.join('\n')}\n}` }} />
}

type ChartTooltipPayload = {
  dataKey?: string | number
  name?: string | number
  value?: string | number | null
  color?: string
}

// The solid tooltip (surface-floating, e3, radius-md): the label, then one row per series.
function ChartTooltipContent({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
}: {
  active?: boolean
  payload?: ChartTooltipPayload[]
  label?: string | number
  labelFormatter?: (label: string | number) => string
  valueFormatter?: (value: string | number) => string
}) {
  const { config } = useChart()
  // A trace's gap point (see lib/telemetry.ts) has no values to read out.
  const rows = payload?.filter((item) => item.value !== null && item.value !== undefined) ?? []
  if (!active || rows.length === 0) return null

  return (
    <div className="floating min-w-32 rounded-md px-3 py-2 text-footnote text-label shadow-(--shadow-e3)">
      {label !== undefined && label !== '' ? <div className="mb-1 font-medium">{labelFormatter ? labelFormatter(label) : label}</div> : null}
      <div className="space-y-1">
        {rows.map((item) => {
          const key = String(item.dataKey ?? item.name ?? '')
          const labelText = config[key]?.label ?? item.name ?? key
          const value = item.value ?? ''
          return (
            <div key={`${key}-${value}`} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-label-secondary">
                <span className="size-2 rounded-full" style={{ backgroundColor: item.color ?? config[key]?.color }} />
                {labelText}
              </span>
              <span className="font-medium tabular-nums">{valueFormatter ? valueFormatter(value) : value}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const ChartTooltip = RechartsTooltip

export { ChartContainer, ChartTooltip, ChartTooltipContent }
