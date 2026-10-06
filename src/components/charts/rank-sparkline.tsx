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

  // Break the line at unranked observations. A ranked point with unranked neighbours on
  // both sides has no line to sit on, so it gets a dot instead.
  const segments: string[] = []
  const isolated: number[] = []
  let current = ""
  let currentStart = -1
  const close = (end: number) => {
    if (!current) return
    if (end === currentStart) isolated.push(currentStart)
    else segments.push(current)
    current = ""
  }
  points.forEach((p, i) => {
    if (p.value.kind === "ranked") {
      if (!current) currentStart = i
      current += `${current ? "L" : "M"}${x(i).toFixed(1)},${y(p.value.position).toFixed(1)}`
    } else {
      close(i - 1)
    }
  })
  close(points.length - 1)

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
      {isolated.map((i) => {
        const v = points[i]!.value
        return v.kind === "ranked" && i !== points.length - 1 ? (
          <circle key={`dot-${i}`} cx={x(i)} cy={y(v.position)} r={1.5} fill="var(--data)" />
        ) : null
      })}
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
