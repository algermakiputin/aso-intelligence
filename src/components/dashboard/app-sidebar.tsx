"use client"

import {
  BarChart3,
  Check,
  ChevronsUpDown,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  MessageSquareText,
  Plus,
  Search,
  Settings,
  Sun,
  Swords,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { useTransition } from "react"
import { signOut } from "@/app/(auth)/actions"
import { BrandMark } from "@/components/brand"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { switchActiveAppAction } from "@/features/apps/actions"
import type { AppSummary, WorkspaceSummary } from "@/features/workspaces/context"
import { cn } from "@/lib/utils"
import { PLATFORM_LABELS } from "@/types/aso"

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/keywords", label: "Keywords", icon: Search },
  { href: "/dashboard/competitors", label: "Competitors", icon: Swords, soon: true },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/experiments", label: "Experiments", icon: FlaskConical },
  { href: "/dashboard/reviews", label: "Reviews", icon: MessageSquareText, soon: true },
] as const

export function AppIcon({
  app,
  className,
}: {
  app: Pick<AppSummary, "name" | "iconUrl">
  className?: string
}) {
  if (app.iconUrl) {
    return (
      <Image
        src={app.iconUrl}
        alt=""
        width={64}
        height={64}
        className={cn("size-7 shrink-0 rounded-[22%] border object-cover", className)}
      />
    )
  }
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-[22%] border bg-muted text-[11px] font-semibold text-muted-foreground",
        className,
      )}
    >
      {app.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

export function AppSidebar({
  apps,
  workspaces,
  activeApp,
  email,
}: {
  apps: AppSummary[]
  workspaces: WorkspaceSummary[]
  activeApp: AppSummary
  email: string | null
}) {
  const pathname = usePathname()
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <AppSwitcher
          apps={apps}
          workspaces={workspaces}
          activeApp={activeApp}
          pathname={pathname}
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.href, "exact" in item)}
                    tooltip={item.label}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                  {"soon" in item ? (
                    <SidebarMenuBadge className="text-[10px] font-normal text-muted-foreground">
                      Soon
                    </SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive("/dashboard/settings")}
                  tooltip="Settings"
                >
                  <Link href="/dashboard/settings">
                    <Settings />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <UserMenu email={email} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function AppSwitcher({
  apps,
  workspaces,
  activeApp,
  pathname,
}: {
  apps: AppSummary[]
  workspaces: WorkspaceSummary[]
  activeApp: AppSummary
  pathname: string
}) {
  const [pending, startTransition] = useTransition()
  const activeWorkspace = workspaces.find((w) => w.id === activeApp.workspaceId)

  const switchTo = (appId: string) => {
    const formData = new FormData()
    formData.set("appId", appId)
    formData.set("returnTo", pathname)
    startTransition(() => switchActiveAppAction(formData))
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-open:bg-sidebar-accent" disabled={pending}>
              <AppIcon app={activeApp} />
              <span className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate text-[13px] font-semibold">{activeApp.name}</span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {activeWorkspace?.name}
                  {activeApp.platforms.length > 0
                    ? `, ${activeApp.platforms.map((p) => PLATFORM_LABELS[p]).join(" + ")}`
                    : ""}
                </span>
              </span>
              <ChevronsUpDown className="ml-auto size-3.5 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="bottom" className="w-64">
            {workspaces.map((workspace) => {
              const workspaceApps = apps.filter((a) => a.workspaceId === workspace.id)
              if (workspaceApps.length === 0) return null
              return (
                <DropdownMenuGroup key={workspace.id}>
                  <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                    {workspace.name}
                    {workspace.isDemo ? " (demo data)" : ""}
                  </DropdownMenuLabel>
                  {workspaceApps.map((app) => (
                    <DropdownMenuItem
                      key={app.id}
                      onSelect={() => app.id !== activeApp.id && switchTo(app.id)}
                    >
                      <AppIcon app={app} className="size-5" />
                      <span className="truncate">{app.name}</span>
                      {app.id === activeApp.id ? <Check className="ml-auto size-3.5" /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              )
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/apps/new">
                <Plus />
                Add app
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/apps">All apps</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function UserMenu({ email }: { email: string | null }) {
  const { theme, setTheme } = useTheme()
  const themes = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ] as const

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton className="data-open:bg-sidebar-accent" tooltip={email ?? "Account"}>
              <BrandMark className="size-4" />
              <span className="truncate">{email ?? "Account"}</span>
              <ChevronsUpDown className="ml-auto size-3.5 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
              {email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {themes.map((t) => (
                <DropdownMenuItem key={t.value} onSelect={() => setTheme(t.value)}>
                  <t.icon />
                  {t.label}
                  {theme === t.value ? <Check className="ml-auto size-3.5" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void signOut()}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
