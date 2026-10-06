import type { Metadata } from "next"
import { PlatformLabel } from "@/components/aso/metrics"
import { PageContainer, PageHeader, Panel } from "@/components/dashboard/panel"
import { AppDetailsForm, DeleteAppForm } from "@/features/apps/components/app-settings-forms"
import { AddListingDialog } from "@/features/listings/components/add-listing-dialog"
import { ListingEditor } from "@/features/listings/components/listing-editor"
import { listListings, listMetadataSnapshots } from "@/features/listings/data"
import { requireActiveApp } from "@/features/workspaces/context"
import {
  RANK_OPPORTUNITY_ANCHORS,
  RANK_OPPORTUNITY_BEYOND_100,
  RANK_OPPORTUNITY_UNRANKED,
} from "@/lib/aso/scoring/rank-opportunity"
import { getSourceInfo } from "@/lib/aso/sources"
import { formatDateTime } from "@/lib/format"
import { describeIntegrations } from "@/lib/stores/registry"
import { cn } from "@/lib/utils"
import type { Platform } from "@/types/aso"

export const metadata: Metadata = { title: "Settings" }

const STATE_LABEL = {
  ready: "Connected",
  not_configured: "Not connected",
  unsupported: "Not available",
} as const

export default async function SettingsPage() {
  const ctx = await requireActiveApp()
  const [listings, members] = await Promise.all([
    listListings(ctx.db, ctx.activeApp.id),
    ctx.db
      .from("workspace_members")
      .select("user_id, role, created_at")
      .eq("workspace_id", ctx.activeWorkspace.id),
  ])
  const snapshots = await Promise.all(listings.map((l) => listMetadataSnapshots(ctx.db, l.id, 5)))
  const integrations = describeIntegrations()
  const knownIds: Partial<Record<Platform, string>> = {}
  for (const l of listings) knownIds[l.platform] ??= l.externalAppId

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        title="Settings"
        description={`${ctx.activeApp.name} in ${ctx.activeWorkspace.name}`}
      />

      <Panel
        title="App"
        description="Name and the storefront new keywords default to"
        bodyClassName="p-4"
      >
        <AppDetailsForm app={ctx.activeApp} canEdit={ctx.canEdit} />
      </Panel>

      <section id="listings" className="scroll-mt-16">
        <Panel
          title="Store listings"
          description="The live metadata used for coverage analysis. One listing per platform and storefront."
          action={
            ctx.canEdit ? (
              <AddListingDialog
                defaultCountry={ctx.activeApp.defaultCountry}
                defaultLanguage={ctx.activeApp.defaultLanguage}
                knownIds={knownIds}
              />
            ) : null
          }
        >
          {listings.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No listings yet. Add the App Store or Google Play listing to start.
            </p>
          ) : (
            <div className="divide-y">
              {listings.map((listing, i) => (
                <div key={listing.id} className="space-y-4 p-4">
                  <ListingEditor listing={listing} canEdit={ctx.canEdit} isDemo={ctx.isDemo} />
                  {snapshots[i]!.length > 0 ? (
                    <details className="group rounded-md border">
                      <summary className="cursor-pointer px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                        Metadata history ({snapshots[i]!.length} most recent)
                      </summary>
                      <table className="w-full border-t text-xs">
                        <tbody>
                          {snapshots[i]!.map((s) => (
                            <tr key={s.id} className="border-b last:border-b-0">
                              <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground tabular">
                                {formatDateTime(s.capturedAt)}
                              </td>
                              <td className="px-3 py-1.5">{s.title ?? "(no title)"}</td>
                              <td className="hidden px-3 py-1.5 text-muted-foreground md:table-cell">
                                {s.subtitle}
                              </td>
                              <td className="px-3 py-1.5 text-right whitespace-nowrap text-muted-foreground">
                                {getSourceInfo(s.source).label}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </section>

      <Panel
        title="Integrations"
        description="Store data sources. Credentials live in server environment variables, never in the browser."
      >
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="h-8 px-4 font-medium">Capability</th>
                <th className="h-8 px-4 font-medium">Platform</th>
                <th className="h-8 px-4 font-medium">Provider</th>
                <th className="h-8 px-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {integrations.map((i) => (
                <tr key={i.key} className="border-b align-top last:border-b-0">
                  <td className="px-4 py-2.5">{i.capability}</td>
                  <td className="px-4 py-2.5">
                    <PlatformLabel platform={i.platform} />
                  </td>
                  <td className="px-4 py-2.5">
                    {i.name}
                    <div className="text-xs text-muted-foreground">
                      {i.official ? "Official data" : "Public or estimated data"}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "font-medium",
                        i.status.state === "ready" ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {STATE_LABEL[i.status.state]}
                    </span>
                    <div className="text-xs text-muted-foreground">{i.status.detail}</div>
                    {i.status.state === "not_configured" ? (
                      <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                        Set {i.status.missing.join(", ")}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <section id="scoring" className="scroll-mt-16">
        <Panel
          title="How the numbers work"
          bodyClassName="p-4 space-y-5 text-[13px] leading-relaxed"
        >
          <div className="space-y-1.5">
            <h3 className="font-semibold">Estimated Rank</h3>
            <p className="text-muted-foreground">
              The app&apos;s position in Apple&apos;s public iTunes Search API results for the
              keyword and storefront (up to 200 results). That API approximates App Store search but
              isn&apos;t the same system, so every value is labelled estimated and stored with its
              source, confidence and time. Positions 1–50 are stored with medium confidence; deeper
              positions vary between identical requests, so they and unranked checks are stored with
              low confidence. When the app isn&apos;t returned, the label is the largest round
              threshold the results prove: “&gt;100” if Apple returned 193 results without it. “Not
              found” means the search returned nothing. Neither is ever shown as a number. Movement
              into or out of the results only counts as New or Lost when the check saw deep enough
              to prove it; otherwise it isn&apos;t compared.
            </p>
          </div>
          <div className="space-y-1.5">
            <h3 className="font-semibold">Popularity</h3>
            <p className="text-muted-foreground">
              Apple&apos;s relative search popularity (1–100, storefront-wide) from the Apple Ads
              Search Term Popularity API, or a value entered manually. It is a relative score, not
              search volume. Apple only reports terms above its eligibility threshold, up to 500 per
              genre and storefront, so many tracked keywords have no Apple value. Those show as “Not
              returned”. That is not a zero, and the Opportunity Score treats it as a missing input.
            </p>
          </div>
          <div className="space-y-1.5">
            <h3 className="font-semibold">Difficulty (estimated)</h3>
            <p className="text-muted-foreground">
              Calculated from the 10 apps ranking above or around this app for the keyword (this app
              excluded): each app&apos;s strength is log₁₀(1 + ratings) ÷ log₁₀(1 + 1,000,000),
              capped at 1, weighted by 1/√position. Empty slots count as zero. Bands: under 20 very
              low, under 40 low, under 60 medium, under 80 high, otherwise very high.
            </p>
          </div>
          <div className="space-y-1.5">
            <h3 className="font-semibold">Opportunity Score (opportunity_v1)</h3>
            <p className="text-muted-foreground">
              This tool&apos;s own heuristic, not an industry standard. Each input is normalized to
              0–1, then:
            </p>
            <pre className="overflow-x-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs">
              {
                "score = 100 × (0.30·popularity + 0.30·relevance + 0.25·rankOpportunity + 0.15·(1 − difficulty))"
              }
            </pre>
            <p className="text-muted-foreground">
              Relevance is required. If other inputs are missing, the remaining weights are
              renormalized and the score is marked partial, provided they cover at least 55% of the
              weight. Rank opportunity is highest in striking distance of the top 10:
            </p>
            <table className="text-xs tabular">
              <tbody>
                <tr className="text-muted-foreground">
                  <td className="pr-3">Rank</td>
                  {RANK_OPPORTUNITY_ANCHORS.map(([rank]) => (
                    <td key={rank} className="px-2 text-right">
                      {rank}
                    </td>
                  ))}
                  <td className="px-2 text-right">101+</td>
                  <td className="px-2 text-right">Not ranked</td>
                </tr>
                <tr>
                  <td className="pr-3 text-muted-foreground">Value</td>
                  {RANK_OPPORTUNITY_ANCHORS.map(([rank, value]) => (
                    <td key={rank} className="px-2 text-right">
                      {value.toFixed(2)}
                    </td>
                  ))}
                  <td className="px-2 text-right">{RANK_OPPORTUNITY_BEYOND_100.toFixed(2)}</td>
                  <td className="px-2 text-right">{RANK_OPPORTUNITY_UNRANKED.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="space-y-1.5">
            <h3 className="font-semibold">Estimated Search Visibility</h3>
            <p className="text-muted-foreground">
              100 × Σ(popularity × 1/rank) ÷ Σ popularity across tracked keywords with popularity
              data, counting ranks in the top 100. An index for comparing over time, not a traffic
              estimate.
            </p>
          </div>
        </Panel>
      </section>

      <Panel
        title="Workspace"
        description={`${ctx.activeWorkspace.name}${ctx.isDemo ? ". Demo data" : ""}`}
        bodyClassName="p-4 space-y-2 text-[13px]"
      >
        <p>
          Your role: <span className="font-medium">{ctx.role}</span>.{" "}
          <span className="text-muted-foreground">
            Owners manage members; admins manage apps, keywords and changes; viewers can read
            everything.
          </span>
        </p>
        <p className="text-muted-foreground">
          {members.data?.length ?? 0} {members.data?.length === 1 ? "member" : "members"}:{" "}
          {(members.data ?? [])
            .map((m) => (m.user_id === ctx.user.id ? `you (${m.role})` : m.role))
            .join(", ")}
          . Team invitations are planned for V1.
        </p>
      </Panel>

      {ctx.canEdit ? (
        <Panel
          title="Delete app"
          description="Deletes the app with all its listings, keywords, history and events. This can't be undone."
          bodyClassName="p-4"
        >
          <DeleteAppForm appName={ctx.activeApp.name} />
        </Panel>
      ) : null}
    </PageContainer>
  )
}
