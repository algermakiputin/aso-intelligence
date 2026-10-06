"use client"

import { useMemo } from "react"
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts"
import { describeRank, type RankValue } from "@/lib/aso/rank"
import { formatDate, formatShortDate } from "@/lib/format"

export interface RankChartPoint {
  value: RankValue
  checkedAt: string
}

export interface ChartEvent {
  id: string
  title: string
  happenedAt: string
}

interface Row {
  t: number
  rank: number | null
  lane: number | null
  value: RankValue
}

const DAY = 86_400_000

/** 1 plus round multiples (1, 10, 20, 30 / 1, 50, 100, 150…). */
function rankTicks(axisMax: number): number[] {
  const step = [5, 10, 20, 25, 50, 100].find((s) => axisMax / s <= 5) ?? 100
  const ticks = [1]
  for (let t = step; t <= axisMax; t += step) ticks.push(t)
  return ticks
}

function niceMax(value: number): number {
  const steps = [10, 20, 30, 50, 75, 100, 150, 200]
  return steps.find((s) => s >= value) ?? Math.ceil(value / 50) * 50
}

/**
 * Estimated rank over time. The Y axis is inverted (1 at the top). Observations where
 * the app wasn't ranked are drawn as markers in a separate "Not ranked" lane below the
 * axis range. They are never plotted as a numeric rank. ASO events are vertical
 * annotations.
 */
export function RankHistoryChart({
  points,
  events,
  rangeStart,
  rangeEnd,
  height = 260,
}: {
  points: RankChartPoint[]
  events: ChartEvent[]
  rangeStart: string | null
  rangeEnd: string
  height?: number
}) {
  const { rows, axisMax, laneY, ticks, xTicks, domain } = useMemo(() => {
    const rankedValues = points.flatMap((p) =>
      p.value.kind === "ranked" ? [p.value.position] : [],
    )
    const axisMax = niceMax(Math.max(10, ...rankedValues))
    const laneY = axisMax * 1.12
    const rows: Row[] = points.map((p) => ({
      t: new Date(p.checkedAt).getTime(),
      rank: p.value.kind === "ranked" ? p.value.position : null,
      lane: p.value.kind === "unranked" ? laneY : null,
      value: p.value,
    }))
    const first = rows[0]?.t ?? new Date(rangeEnd).getTime() - 30 * DAY
    const start = rangeStart ? Math.min(new Date(rangeStart).getTime(), first) : first
    const end = Math.max(new Date(rangeEnd).getTime(), rows[rows.length - 1]?.t ?? 0)
    const xTicks =
      end > start
        ? Array.from({ length: 6 }, (_, i) => Math.round(start + ((end - start) * i) / 5))
        : [end]
    return {
      rows,
      axisMax,
      laneY,
      ticks: rankTicks(axisMax),
      xTicks,
      domain: [start, end] as [number, number],
    }
  }, [points, rangeStart, rangeEnd])

  const visibleEvents = events.filter((e) => {
    const t = new Date(e.happenedAt).getTime()
    return t >= domain[0] && t <= domain[1]
  })
  const hasUnranked = rows.some((r) => r.lane !== null)

  return (
    <div style={{ height }} className="w-full text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={domain}
            ticks={xTicks}
            tickFormatter={(t: number) => formatShortDate(new Date(t))}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            minTickGap={40}
          />
          <YAxis
            reversed
            domain={[1, hasUnranked ? laneY * 1.04 : axisMax]}
            ticks={ticks}
            allowDecimals={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11, className: "tabular" }}
            tickLine={false}
            axisLine={false}
            width={34}
          />
          {hasUnranked ? (
            <ReferenceArea
              y1={axisMax + (laneY - axisMax) * 0.45}
              y2={laneY * 1.04}
              fill="var(--muted)"
              fillOpacity={0.6}
              strokeOpacity={0}
              label={{
                value: "Not ranked",
                position: "insideLeft",
                fill: "var(--muted-foreground)",
                fontSize: 10,
              }}
            />
          ) : null}
          {visibleEvents.map((e) => (
            <ReferenceLine
              key={e.id}
              x={new Date(e.happenedAt).getTime()}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.55}
              label={{ value: "◆", position: "top", fill: "var(--foreground)", fontSize: 9 }}
            />
          ))}
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.4 }}
            content={(props) => <RankTooltip {...props} events={visibleEvents} />}
            isAnimationActive={false}
          />
          <Line
            dataKey="rank"
            type="linear"
            stroke="var(--data)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            dot={
              rows.length <= 40
                ? { r: 2.5, fill: "var(--data)", stroke: "var(--card)", strokeWidth: 1.5 }
                : false
            }
            activeDot={{ r: 4, fill: "var(--data)", stroke: "var(--card)", strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
          {hasUnranked ? (
            <Scatter
              dataKey="lane"
              fill="var(--muted-foreground)"
              shape="circle"
              isAnimationActive={false}
              legendType="none"
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function RankTooltip({ active, payload, events }: TooltipContentProps & { events: ChartEvent[] }) {
  const row = payload?.[0]?.payload as Row | undefined
  if (!active || !row) return null
  const nearby = events.filter((e) => Math.abs(new Date(e.happenedAt).getTime() - row.t) < DAY)
  return (
    <div className="min-w-40 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm">
      <div className="text-base font-semibold tabular">
        {row.value.kind === "ranked" ? `#${row.value.position}` : describeRank(row.value)}
      </div>
      <div className="text-muted-foreground">Estimated rank, {formatDate(new Date(row.t))}</div>
      {nearby.map((e) => (
        <div key={e.id} className="mt-1.5 border-t pt-1.5">
          ◆ {e.title}
        </div>
      ))}
    </div>
  )
}
