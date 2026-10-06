import { History } from "lucide-react"
import type { Metadata } from "next"
import { EmptyState } from "@/components/dashboard/empty-state"
import { PageContainer, PageHeader, Panel } from "@/components/dashboard/panel"
import { DeleteEventButton } from "@/features/experiments/components/delete-event-button"
import { EventItem } from "@/features/experiments/components/event-item"
import { RecordEventDialog } from "@/features/experiments/components/record-event-dialog"
import { listEvents } from "@/features/experiments/data"
import type { AsoEvent } from "@/features/experiments/model"
import { listListings } from "@/features/listings/data"
import { requireActiveApp } from "@/features/workspaces/context"
import { formatMonth, formatShortDate, toDateInputValue } from "@/lib/format"

export const metadata: Metadata = { title: "Experiments" }

function groupByMonth(events: AsoEvent[]) {
  const groups = new Map<string, AsoEvent[]>()
  for (const event of events) {
    const key = event.happenedAt.slice(0, 7)
    groups.set(key, [...(groups.get(key) ?? []), event])
  }
  return [...groups.entries()]
}

export default async function ExperimentsPage() {
  const ctx = await requireActiveApp()
  const [events, listings] = await Promise.all([
    listEvents(ctx.db, ctx.activeApp.id),
    listListings(ctx.db, ctx.activeApp.id),
  ])
  const primary =
    listings.find((l) => l.country === ctx.activeApp.defaultCountry) ?? listings[0] ?? null

  const recordDialog = ctx.canEdit ? (
    <RecordEventDialog
      platforms={ctx.activeApp.platforms}
      defaultCountry={ctx.activeApp.defaultCountry}
      today={toDateInputValue(new Date())}
      currentText={{
        title_change: primary?.title,
        subtitle_change: primary?.subtitle,
        keyword_change: primary?.keywordField,
        description_change: primary?.description,
      }}
    />
  ) : null

  return (
    <PageContainer className="max-w-[1100px]">
      <PageHeader
        title="Experiments"
        description="A timeline of listing changes and releases. Each change also appears as a marker on keyword rank charts, so you can see what moved afterwards."
        actions={recordDialog}
      />

      {events.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={History}
            title="No changes recorded yet"
            description="When you change the title, subtitle, keywords, screenshots or ship a release, record it here. Before/after impact analysis builds on this timeline later."
          >
            {recordDialog}
          </EmptyState>
        </div>
      ) : (
        groupByMonth(events).map(([month, monthEvents]) => (
          <Panel
            key={month}
            title={formatMonth(`${month}-01T00:00:00Z`)}
            description={`${monthEvents.length} ${monthEvents.length === 1 ? "change" : "changes"}`}
          >
            <ol className="divide-y">
              {monthEvents.map((event) => (
                <li
                  key={event.id}
                  className="grid grid-cols-[56px_minmax(0,1fr)_auto] gap-4 px-4 py-4"
                >
                  <time
                    dateTime={event.happenedAt}
                    className="pt-0.5 text-xs font-medium text-muted-foreground tabular"
                  >
                    {formatShortDate(event.happenedAt)}
                  </time>
                  <EventItem event={event} />
                  {ctx.canEdit && !ctx.isDemo ? (
                    <DeleteEventButton eventId={event.id} title={event.title} />
                  ) : (
                    <span />
                  )}
                </li>
              ))}
            </ol>
          </Panel>
        ))
      )}

      <p className="text-xs text-muted-foreground">
        Recording a change never publishes anything to App Store Connect or Google Play.
        Before/after impact analysis is planned for V0.5.
      </p>
    </PageContainer>
  )
}
