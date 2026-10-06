import { Search } from "lucide-react"
import type { Metadata } from "next"
import { EmptyState } from "@/components/dashboard/empty-state"
import { PageContainer, PageHeader } from "@/components/dashboard/panel"
import { AddKeywordsDialog } from "@/features/keywords/components/add-keywords-dialog"
import { KeywordsTable } from "@/features/keywords/components/keywords-table"
import { listKeywords } from "@/features/keywords/data"
import { RefreshRankingsButton } from "@/features/rankings/components/refresh-rankings-button"
import { requireActiveApp } from "@/features/workspaces/context"
import { getPopularityProvider } from "@/lib/stores/registry"

export const metadata: Metadata = { title: "Keywords" }
// Manual refresh batches run as Server Actions on this page.
export const maxDuration = 60

export default async function KeywordsPage() {
  const ctx = await requireActiveApp()
  const keywords = await listKeywords(ctx.db, ctx.activeApp.id)
  const now = new Date().toISOString()
  const popularityConnected = getPopularityProvider("ios")?.status().state === "ready"
  const tracked = keywords.filter((k) => k.tracked).length

  const addDialog = (
    <AddKeywordsDialog
      platforms={ctx.activeApp.platforms}
      defaultCountry={ctx.activeApp.defaultCountry}
      defaultLanguage={ctx.activeApp.defaultLanguage}
    />
  )

  return (
    <PageContainer>
      <PageHeader
        title="Keywords"
        description={
          keywords.length === 0
            ? "Track the search terms you want this app to rank for."
            : `${tracked} tracked${keywords.length > tracked ? `, ${keywords.length - tracked} paused` : ""}. Sorted by Opportunity Score.`
        }
        actions={
          ctx.canEdit ? (
            <>
              {keywords.length > 0 ? (
                <RefreshRankingsButton
                  disabled={ctx.isDemo || tracked === 0}
                  disabledReason={
                    ctx.isDemo ? "Rank checks are disabled for demo data" : "No tracked keywords"
                  }
                />
              ) : null}
              {addDialog}
            </>
          ) : null
        }
      />

      {keywords.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={Search}
            title="No keywords yet"
            description="Add the terms people might search for to find this app. Paste a list and set how relevant the terms are; then refresh rankings to see where the app appears."
          >
            {ctx.canEdit ? (
              addDialog
            ) : (
              <p className="text-sm text-muted-foreground">
                Ask a workspace admin to add keywords.
              </p>
            )}
          </EmptyState>
        </div>
      ) : (
        <KeywordsTable
          keywords={keywords}
          now={now}
          canEdit={ctx.canEdit}
          popularityConnected={popularityConnected}
        />
      )}
    </PageContainer>
  )
}
