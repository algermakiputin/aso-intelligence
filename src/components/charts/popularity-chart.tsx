"use client"

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts"
import { getSourceInfo } from "@/lib/aso/sources"
import { formatDate, formatPopularityPeriod, formatShortDate } from "@/lib/format"
import type { PopularityStatus } from "@/types/aso"

export interface PopularityChartPoint {
  status: PopularityStatus
  score: number | null
  source: string
  granularity: string
  periodStart: string | null
  periodEnd: string | null
  measuredAt: string
}

interface Row {
  t: number
  score: number | null
  lane: number | null
  source: string
  period: string | null
}

const LANE = -10

/**
 * Apple relative popularity (1–100) over time. Terms Apple's dataset didn't return sit in
 * a separate "Not returned" lane; they are not zero and are not plotted on the 0–100 scale.
 */
export function PopularityChart({
  points,
  height = 180,
}: {
  points: PopularityChartPoint[]
  height?: number
}) {
  const rows: Row[] = points.map((p) => ({
    t: new Date(p.measuredAt).getTime(),
    score: p.status === "measured" ? p.score : null,
    lane: p.status === "below_threshold" ? LANE : null,
    source: p.source,
    period: formatPopularityPeriod(p),
  }))
  const hasLane = rows.some((r) => r.lane !== null)

  return (
    <div style={{ height }} className="w-full text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t: number) => formatShortDate(new Date(t))}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            minTickGap={40}
          />
          <YAxis
            domain={[hasLane ? LANE - 4 : 0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={34}
          />
          {hasLane ? (
            <ReferenceArea
              y1={LANE - 4}
              y2={-3}
              fill="var(--muted)"
              fillOpacity={0.6}
              strokeOpacity={0}
              label={{
                value: "Not returned",
                position: "insideLeft",
                fill: "var(--muted-foreground)",
                fontSize: 10,
              }}
            />
          ) : null}
          <Tooltip
            content={(props) => <PopularityTooltip {...props} />}
            cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.4 }}
            isAnimationActive={false}
          />
          <Line
            dataKey="score"
            stroke="var(--data)"
            strokeWidth={2}
            dot={{ r: 2.5, fill: "var(--data)", stroke: "var(--card)", strokeWidth: 1.5 }}
            connectNulls={false}
            isAnimationActive={false}
          />
          {hasLane ? (
            <Scatter dataKey="lane" fill="var(--muted-foreground)" isAnimationActive={false} />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function PopularityTooltip({ active, payload }: TooltipContentProps) {
  const row = payload?.[0]?.payload as Row | undefined
  if (!active || !row) return null
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm">
      <div className="text-base font-semibold tabular">
        {row.score === null ? "Not returned by Apple" : Math.round(row.score)}
      </div>
      <div className="text-muted-foreground">
        Popularity, {row.period ?? formatDate(new Date(row.t))}, {getSourceInfo(row.source).label}
      </div>
    </div>
  )
}
