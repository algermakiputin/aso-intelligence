import type * as React from "react"
import { cn } from "@/lib/utils"

/**
 * A row of related figures in one bordered strip, divided by hairlines.
 * Values use proportional figures (they stand alone, not in a column).
 */
export function StatStrip({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 overflow-hidden rounded-lg border bg-card sm:grid-cols-3 xl:grid-cols-6",
        "[&>*]:border-r [&>*]:border-b",
        className,
      )}
    >
      {children}
    </div>
  )
}

export function Stat({
  label,
  value,
  detail,
  hint,
}: {
  label: string
  value: React.ReactNode
  detail?: React.ReactNode
  hint?: string
}) {
  return (
    <div
      className="-mr-px -mb-px flex min-h-[92px] flex-col justify-between gap-2 px-4 py-3"
      title={hint}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl leading-none font-semibold tracking-tight">{value}</div>
      <div className="min-h-4 text-xs text-muted-foreground">{detail}</div>
    </div>
  )
}
