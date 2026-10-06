import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { BrandWordmark } from "@/components/brand"
import { AddAppForm } from "@/features/apps/components/add-app-form"
import { CreateWorkspaceForm } from "@/features/apps/components/create-workspace-form"
import { getDashboardContext } from "@/features/workspaces/context"
import { canEdit } from "@/types/aso"

export const metadata: Metadata = { title: "Set up" }

export default async function OnboardingPage() {
  const ctx = await getDashboardContext()
  if (ctx.apps.length > 0) redirect("/dashboard")

  const editable = ctx.workspaces.filter((w) => canEdit(w.role) && !w.isDemo)
  const step = editable.length === 0 ? 1 : 2

  return (
    <div className="flex min-h-svh flex-col">
      <header className="px-6 py-5">
        <BrandWordmark />
      </header>
      <main className="flex flex-1 justify-center px-6 pt-[8vh] pb-16">
        <div className="w-full max-w-xl space-y-8">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground tabular">Step {step} of 2</p>
            <h1 className="text-xl font-semibold tracking-tight">
              {step === 1 ? "Create a workspace" : "Add your first app"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {step === 1
                ? "Everything you track lives in a workspace."
                : "Add the app you want to optimize. It can have an App Store listing, a Google Play listing, or both."}
            </p>
          </div>
          {step === 1 ? (
            <CreateWorkspaceForm />
          ) : (
            <AddAppForm workspaces={editable.map((w) => ({ id: w.id, name: w.name }))} />
          )}
        </div>
      </main>
    </div>
  )
}
