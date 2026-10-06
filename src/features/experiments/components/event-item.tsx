import { getSourceInfo } from "@/lib/aso/sources"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { PLATFORM_LABELS } from "@/types/aso"
import { type AsoEvent, EVENT_TYPE_LABELS } from "../model"

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}

/** One ASO change: what changed, when, where, and the before → after text. */
export function EventItem({ event, compact = false }: { event: AsoEvent; compact?: boolean }) {
  const source = getSourceInfo(event.source)
  const scope = [
    event.platform ? PLATFORM_LABELS[event.platform] : "All platforms",
    event.country ?? "all storefronts",
  ].join(", ")
  const limit = compact ? 80 : 400

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[13px] font-medium">{event.title}</span>
        <span className="text-xs text-muted-foreground">
          {EVENT_TYPE_LABELS[event.type]}. {scope}
          {compact ? `. ${formatDate(event.happenedAt)}` : ""}
        </span>
      </div>
      {event.before || event.after ? (
        <div
          className={cn(
            "grid gap-1 text-[13px]",
            !compact && "sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-start sm:gap-3",
          )}
        >
          <div className="rounded-md border border-dashed px-2 py-1 [overflow-wrap:anywhere] text-muted-foreground line-through decoration-muted-foreground/40">
            {event.before ? (
              truncate(event.before, limit)
            ) : (
              <span className="no-underline">(none)</span>
            )}
          </div>
          <div className="text-center text-muted-foreground" aria-label="changed to">
            {compact ? "↓" : "→"}
          </div>
          <div className="rounded-md border px-2 py-1 [overflow-wrap:anywhere]">
            {event.after ? truncate(event.after, limit) : "(none)"}
          </div>
        </div>
      ) : null}
      {event.description && !compact ? (
        <p className="text-xs text-muted-foreground">{event.description}</p>
      ) : null}
      {source.id !== "manual" ? (
        <p className="text-[11px] text-muted-foreground">Source: {source.label}</p>
      ) : null}
    </div>
  )
}
