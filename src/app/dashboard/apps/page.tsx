import { Plus } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { PlatformLabel } from "@/components/aso/metrics"
import { AppIcon } from "@/components/dashboard/app-sidebar"
import { PageContainer, PageHeader, Panel } from "@/components/dashboard/panel"
import { Button } from "@/components/ui/button"
import { switchActiveAppAction } from "@/features/apps/actions"
import { requireActiveApp } from "@/features/workspaces/context"
import { countryName } from "@/lib/validation/locales"

export const metadata: Metadata = { title: "Apps" }

export default async function AppsPage() {
  const ctx = await requireActiveApp()

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        title="Apps"
        description="Every app you can access, by workspace."
        actions={
          <Button asChild>
            <Link href="/dashboard/apps/new">
              <Plus />
              Add app
            </Link>
          </Button>
        }
      />
      {ctx.workspaces.map((workspace) => {
        const apps = ctx.apps.filter((a) => a.workspaceId === workspace.id)
        return (
          <Panel
            key={workspace.id}
            title={workspace.name}
            description={`${workspace.isDemo ? "Demo data. " : ""}Your role: ${workspace.role}`}
          >
            {apps.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No apps in this workspace yet.</p>
            ) : (
              <ul className="divide-y">
                {apps.map((app) => (
                  <li key={app.id} className="flex items-center gap-3 px-4 py-3">
                    <AppIcon app={app} className="size-9" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{app.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Default storefront {countryName(app.defaultCountry)} ({app.defaultLanguage})
                      </div>
                    </div>
                    <div className="hidden gap-1 sm:flex">
                      {app.platforms.map((p) => (
                        <PlatformLabel key={p} platform={p} />
                      ))}
                    </div>
                    {app.id === ctx.activeApp.id ? (
                      <span className="w-20 text-right text-xs text-muted-foreground">Active</span>
                    ) : (
                      <form action={switchActiveAppAction}>
                        <input type="hidden" name="appId" value={app.id} />
                        <input type="hidden" name="returnTo" value="/dashboard" />
                        <Button type="submit" variant="outline" size="sm" className="w-20">
                          Open
                        </Button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )
      })}
    </PageContainer>
  )
}
