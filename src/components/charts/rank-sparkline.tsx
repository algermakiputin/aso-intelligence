import type { RankValue } from "@/lib/aso/rank"

/**
 * Tiny inline trend for table rows. Rank axis is inverted (better = higher). Unranked
 * observations are drawn as hollow ticks on the baseline, never as a numeric rank.
 */
export function RankSparkline({
  points,
  width = 72,
  height = 20,
}: {
  points: Array<{ value: RankValue }>
  width?: number
  height?: number
}) {
  const ranked = points.flatMap((p, i) =>
    p.value.kind === "ranked" ? [{ i, rank: p.value.position }] : [],
  )
  if (points.length < 2 || ranked.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>
  }

  const pad = 2
  const min = Math.min(...ranked.map((r) => r.rank))
  const max = Math.max(...ranked.map((r) => r.rank))
  const span = Math.max(1, max - min)
  const x = (i: number) => pad + (i / (points.length - 1)) * (width - pad * 2)
  const y = (rank: number) => pad + ((rank - min) / span) * (height - pad * 2 - 3)

  // Break the line at unranked observations.
  const segments: string[] = []
  let current = ""
  points.forEach((p, i) => {
    if (p.value.kind === "ranked") {
      current += `${current ? "L" : "M"}${x(i).toFixed(1)},${y(p.value.position).toFixed(1)}`
    } else if (current) {
      segments.push(current)
      current = ""
    }
  })
  if (current) segments.push(current)

  const last = points[points.length - 1]!
  const label = `Trend over the last ${points.length} checks`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      className="overflow-visible"
    >
      {segments.map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke="var(--data)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {points.map((p, i) =>
        p.value.kind === "unranked" ? (
          <line
            key={i}
            x1={x(i)}
            x2={x(i)}
            y1={height - 3}
            y2={height - 0.5}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
            opacity={0.6}
          />
        ) : null,
      )}
      {last.value.kind === "ranked" ? (
        <circle
          cx={x(points.length - 1)}
          cy={y(last.value.position)}
          r={2}
          fill="var(--data)"
          stroke="var(--card)"
          strokeWidth={1}
        />
      ) : null}
    </svg>
  )
}
