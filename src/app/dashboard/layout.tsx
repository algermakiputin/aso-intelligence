import { FlaskConical } from "lucide-react"
import { cookies } from "next/headers"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { requireActiveApp } from "@/features/workspaces/context"
import { countryName } from "@/lib/validation/locales"

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const ctx = await requireActiveApp()
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false"

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar
        apps={ctx.apps}
        workspaces={ctx.workspaces}
        activeApp={ctx.activeApp}
        email={ctx.user.email}
      />
      {/* min-w-0 lets wide tables scroll inside their own container instead of the page. */}
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-11 shrink-0 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur md:px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <span className="truncate text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{ctx.activeApp.name}</span>
            <span className="hidden sm:inline">
              {" "}
              in {ctx.activeWorkspace.name}. Default storefront:{" "}
              {countryName(ctx.activeApp.defaultCountry)} ({ctx.activeApp.defaultLanguage})
            </span>
          </span>
          {ctx.role === "viewer" ? (
            <span className="ml-auto rounded-sm border px-1.5 py-0.5 text-[11px] text-muted-foreground">
              Read-only
            </span>
          ) : null}
        </header>
        {ctx.isDemo ? (
          <div
            role="status"
            className="flex items-center gap-2 border-b bg-attention-soft px-4 py-2 text-xs md:px-6"
          >
            <FlaskConical className="size-3.5 shrink-0 text-attention" aria-hidden />
            <span>
              <span className="font-medium">Demo data.</span> Everything in this workspace is
              synthetic sample data for previewing the product. It is not real App Store data.
            </span>
          </div>
        ) : null}
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
