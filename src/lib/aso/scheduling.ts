/**
 * Which keywords are due for a rank check. Keeps network traffic proportional to need:
 * priority keywords roughly daily, everything else every 2–3 days, and manual refreshes
 * never re-check a keyword that was checked a few hours ago.
 */

export interface SchedulePolicy {
  priorityIntervalHours: number
  normalIntervalHours: number
  /** Manual refresh skips keywords checked more recently than this. */
  manualMinAgeHours: number
}

export const DEFAULT_SCHEDULE_POLICY: SchedulePolicy = {
  priorityIntervalHours: 20,
  normalIntervalHours: 60,
  manualMinAgeHours: 6,
}

export interface ScheduleCandidate {
  id: string
  tracked: boolean
  isPriority: boolean
  lastCheckedAt: Date | null
}

export type ScheduleMode = "scheduled" | "manual"

const HOUR_MS = 3_600_000

export function isKeywordDue(
  candidate: ScheduleCandidate,
  now: Date,
  mode: ScheduleMode,
  policy: SchedulePolicy = DEFAULT_SCHEDULE_POLICY,
): boolean {
  if (!candidate.tracked) return false
  if (candidate.lastCheckedAt === null) return true
  const ageHours = (now.getTime() - candidate.lastCheckedAt.getTime()) / HOUR_MS
  if (mode === "manual") return ageHours >= policy.manualMinAgeHours
  const interval = candidate.isPriority ? policy.priorityIntervalHours : policy.normalIntervalHours
  return ageHours >= interval
}

/**
 * Due keywords in check order: never-checked first, then priority, then oldest check.
 */
export function selectDueKeywords<T extends ScheduleCandidate>(
  candidates: ReadonlyArray<T>,
  options: { now: Date; mode: ScheduleMode; limit?: number; policy?: SchedulePolicy },
): T[] {
  const policy = options.policy ?? DEFAULT_SCHEDULE_POLICY
  const due = candidates
    .filter((c) => isKeywordDue(c, options.now, options.mode, policy))
    .sort((a, b) => {
      if (a.lastCheckedAt === null || b.lastCheckedAt === null) {
        return (a.lastCheckedAt === null ? 0 : 1) - (b.lastCheckedAt === null ? 0 : 1)
      }
      if (a.isPriority !== b.isPriority) return a.isPriority ? -1 : 1
      return a.lastCheckedAt.getTime() - b.lastCheckedAt.getTime()
    })
  return options.limit === undefined ? due : due.slice(0, options.limit)
}

export function isStale(lastCheckedAt: Date | null, now: Date, hours: number): boolean {
  return lastCheckedAt === null || now.getTime() - lastCheckedAt.getTime() > hours * HOUR_MS
}
