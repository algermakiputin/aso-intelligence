import type { Metadata } from "next"
import Link from "next/link"
import { PageContainer, PageHeader, Panel } from "@/components/dashboard/panel"
import { AddAppForm } from "@/features/apps/components/add-app-form"
import { getDashboardContext } from "@/features/workspaces/context"
import { canEdit } from "@/types/aso"

export const metadata: Metadata = { title: "Add app" }

export default async function NewAppPage() {
  const ctx = await getDashboardContext()
  const editable = ctx.workspaces.filter((w) => canEdit(w.role) && !w.isDemo)

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        eyebrow={
          <Link href="/dashboard/apps" className="hover:text-foreground">
            Apps
          </Link>
        }
        title="Add app"
        description="Each app keeps its own keywords, listings and change history."
      />
      <Panel bodyClassName="p-5">
        {editable.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You need owner or admin access to a workspace to add apps.
          </p>
        ) : (
          <AddAppForm workspaces={editable.map((w) => ({ id: w.id, name: w.name }))} />
        )}
      </Panel>
    </PageContainer>
  )
}
