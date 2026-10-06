import { cn } from "@/lib/utils"

export interface DistributionSegment {
  key: string
  label: string
  count: number
  /** Tailwind background class from the validated ordinal rank ramp. */
  colorClass: string
}

/**
 * Where tracked keywords currently rank, as one segmented bar. Ordinal blue ramp
 * (darkest = best band); keywords provably outside the top 100 are neutral grey, and
 * unranked keywords whose check returned fewer than 100 results get a lighter grey of
 * their own. Counts are always printed in the legend, so color never carries the value
 * alone.
 */
export function RankDistribution({
  segments,
  total,
}: {
  segments: DistributionSegment[]
  total: number
}) {
  const visible = segments.filter((s) => s.count > 0)
  return (
    <div className="space-y-3">
      <div
        className="flex h-3 w-full gap-[2px] overflow-hidden rounded-sm bg-card"
        role="img"
        aria-label={segments.map((s) => `${s.label}: ${s.count}`).join(", ")}
      >
        {visible.map((s, i) => (
          <div
            key={s.key}
            className={cn(
              s.colorClass,
              "h-full",
              i === 0 && "rounded-l-sm",
              i === visible.length - 1 && "rounded-r-sm",
            )}
            style={{ width: `${(s.count / Math.max(1, total)) * 100}%` }}
            title={`${s.label}: ${s.count}`}
          />
        ))}
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-5">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-2">
            <span className={cn("size-2 shrink-0 rounded-[2px]", s.colorClass)} aria-hidden />
            <dt className="text-muted-foreground">{s.label}</dt>
            <dd className="ml-auto font-medium tabular sm:ml-0">{s.count}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
