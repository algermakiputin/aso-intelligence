"use client"

import { useMemo } from "react"
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts"
import { formatCompact, formatDate, formatNumber, formatShortDate } from "@/lib/format"
import type { ChartEvent } from "./rank-history-chart"

export interface MetricTrendPoint {
  date: string
  /** null = no data for the date (never drawn as zero). */
  value: number | null
  provisional: boolean
}

interface Row {
  t: number
  value: number | null
  provisional: boolean
}

const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`)

/** 0 plus up to four clean steps (0 / 250 / 500…). */
function valueTicks(max: number): number[] {
  if (max <= 0) return [0, 1]
  const magnitude = 10 ** Math.floor(Math.log10(max))
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => max / s <= 4) ?? magnitude * 10
  const top = Math.ceil(max / step) * step
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
}

/**
 * One store metric over time: a single series, so no legend (the panel title names it).
 * Days without data break the line instead of dropping to zero. The trailing days whose
 * numbers Apple may still revise sit under a "Not final" band. ASO events are
 * vertical annotations.
 */
export function MetricTrendChart({
  label,
  points,
  events = [],
  height = 180,
}: {
  label: string
  points: MetricTrendPoint[]
  events?: ChartEvent[]
  height?: number
}) {
  const { rows, ticks, provisionalStart, domain } = useMemo(() => {
    const rows: Row[] = points.map((p) => ({
      t: toTime(p.date),
      value: p.value,
      provisional: p.provisional,
    }))
    const max = Math.max(0, ...rows.map((r) => r.value ?? 0))
    const firstProvisional = rows.find((r) => r.provisional && r.value !== null)
    const first = rows[0]?.t ?? 0
    const last = rows.at(-1)?.t ?? 0
    return {
      rows,
      ticks: valueTicks(max),
      provisionalStart: firstProvisional?.t ?? null,
      domain: [first, last] as [number, number],
    }
  }, [points])

  const visibleEvents = events.filter((e) => {
    const t = new Date(e.happenedAt).getTime()
    return t >= domain[0] && t <= domain[1] + 86_400_000
  })
  const yMax = ticks.at(-1) ?? 1

  return (
    <div style={{ height }} className="w-full text-xs" role="img" aria-label={`${label} by day`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 14, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={domain}
            tickFormatter={(t: number) => formatShortDate(new Date(t))}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            minTickGap={48}
          />
          <YAxis
            domain={[0, yMax]}
            ticks={ticks}
            allowDecimals={false}
            tickFormatter={(v: number) => formatCompact(v)}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11, className: "tabular" }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          {provisionalStart !== null ? (
            <ReferenceArea
              x1={provisionalStart - 43_200_000}
              x2={domain[1] + 43_200_000}
              fill="var(--muted)"
              fillOpacity={0.55}
              strokeOpacity={0}
              ifOverflow="hidden"
              label={{
                value: "Not final",
                position: "insideTopRight",
                fill: "var(--muted-foreground)",
                fontSize: 10,
              }}
            />
          ) : null}
          {visibleEvents.map((e) => (
            <ReferenceLine
              key={e.id}
              x={toTime(e.happenedAt.slice(0, 10))}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.55}
              label={{ value: "◆", position: "top", fill: "var(--foreground)", fontSize: 9 }}
            />
          ))}
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.4 }}
            content={(props) => <TrendTooltip {...props} label={label} events={visibleEvents} />}
            isAnimationActive={false}
          />
          <Area
            dataKey="value"
            type="linear"
            stroke="none"
            fill="var(--data)"
            fillOpacity={0.1}
            connectNulls={false}
            isAnimationActive={false}
            activeDot={false}
          />
          <Line
            dataKey="value"
            type="linear"
            stroke="var(--data)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            dot={false}
            activeDot={{ r: 4, fill: "var(--data)", stroke: "var(--card)", strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function TrendTooltip({
  active,
  payload,
  label,
  events,
}: TooltipContentProps & { label: string; events: ChartEvent[] }) {
  const row = payload?.[0]?.payload as Row | undefined
  if (!active || !row) return null
  const day = new Date(row.t).toISOString().slice(0, 10)
  const nearby = events.filter((e) => e.happenedAt.slice(0, 10) === day)
  return (
    <div className="min-w-40 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm">
      <div className="text-base font-semibold tabular">
        {row.value === null ? "No data" : formatNumber(row.value)}
      </div>
      <div className="text-muted-foreground">
        {label}, {formatDate(new Date(row.t))}
        {row.provisional && row.value !== null ? " (not final)" : ""}
      </div>
      {nearby.map((e) => (
        <div key={e.id} className="mt-1.5 border-t pt-1.5">
          ◆ {e.title}
        </div>
      ))}
    </div>
  )
}
