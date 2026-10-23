'use client'

// A telemetry trace over time on the Recharts wrapper (DESIGN.md → Web app → Charts):
// 2px lines without dots or animation, so a live chart only redraws when data
// arrives. The x axis is seconds from an origin (see lib/telemetry.ts), read as a
// clock. The title shows above the chart; dense series get a one-line
// screen-reader summary after it instead of a table.

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { formatClock, type TracePoint } from '@/lib/telemetry'

export type TraceSeries = {
  key: Exclude<keyof TracePoint, 't'>
  label: string
  // A token colour, e.g. 'var(--brand-500)'.
  color: string
  // Steps instead of slopes, for gears.
  step?: boolean
}

export function TraceChart({
  title,
  summary,
  points,
  series,
  yDomain,
  xDomain,
  unit = '',
}: {
  title: string
  // What a screen reader hears about the chart, e.g. "0 to 302 km/h".
  summary: string
  points: readonly TracePoint[]
  series: readonly TraceSeries[]
  yDomain?: readonly [number, number]
  // Fixed x range in seconds, e.g. [-30, 0] for a rolling trace; else the data's.
  xDomain?: readonly [number, number]
  unit?: string
}) {
  const config: ChartConfig = Object.fromEntries(series.map((entry) => [entry.key, { label: entry.label, color: entry.color }]))
  return (
    <figure className="m-0 min-w-0">
      <figcaption className="mb-2 text-callout font-semibold">
        {title}
        <span className="sr-only">{`: ${summary}`}</span>
      </figcaption>
      <ChartContainer config={config} className="h-[180px]">
        <LineChart data={[...points]} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={xDomain ? [...xDomain] : ['dataMin', 'dataMax']}
            allowDataOverflow
            tickFormatter={formatClock}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
          />
          <YAxis domain={yDomain ? [...yDomain] : ['auto', 'auto']} allowDecimals={false} tickLine={false} axisLine={false} width={44} />
          <ChartTooltip
            isAnimationActive={false}
            content={<ChartTooltipContent labelFormatter={(label) => formatClock(Number(label))} valueFormatter={(value) => `${value}${unit}`} />}
          />
          {series.map((entry) => (
            <Line
              key={entry.key}
              dataKey={entry.key}
              type={entry.step ? 'stepAfter' : 'linear'}
              stroke={`var(--color-${entry.key})`}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartContainer>
    </figure>
  )
}
