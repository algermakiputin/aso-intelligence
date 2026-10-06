/**
 * Display formatting. Functions that depend on "now" take it as an argument so server
 * and client renders agree (no hydration mismatches from clock drift).
 */

const numberFormat = new Intl.NumberFormat("en-US")
const compactFormat = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
})
const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})
const shortDateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})
const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
})
const monthFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})

export function formatNumber(value: number): string {
  return numberFormat.format(value)
}

export function formatCompact(value: number): string {
  return value < 10_000 ? numberFormat.format(value) : compactFormat.format(value)
}

export function formatDate(value: string | Date): string {
  return dateFormat.format(new Date(value))
}

export function formatShortDate(value: string | Date): string {
  return shortDateFormat.format(new Date(value))
}

export function formatDateTime(value: string | Date): string {
  return dateTimeFormat.format(new Date(value))
}

export function formatMonth(value: string | Date): string {
  return monthFormat.format(new Date(value))
}

/** Popularity period: "Sep 27 – Oct 3, 2026" (weekly), "September 2026" (monthly), else null. */
export function formatPopularityPeriod(period: {
  granularity: string
  periodStart: string | null
  periodEnd: string | null
}): string | null {
  if (!period.periodStart) return null
  const start = `${period.periodStart}T00:00:00Z`
  if (period.granularity === "monthly") return formatMonth(start)
  if (period.periodEnd && period.periodEnd !== period.periodStart) {
    return `${formatShortDate(start)} – ${formatDate(`${period.periodEnd}T00:00:00Z`)}`
  }
  return formatDate(start)
}

export function formatRelative(value: string | Date, now: string | Date): string {
  const diffMs = new Date(now).getTime() - new Date(value).getTime()
  const minutes = Math.round(diffMs / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(value)
}

/** YYYY-MM-DD in UTC, for date inputs. */
export function toDateInputValue(value: Date): string {
  return value.toISOString().slice(0, 10)
}
