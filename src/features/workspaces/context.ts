import "server-only"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"
import { getSessionUser, getSupabase, type SessionUser } from "@/lib/auth/session"
import type { AsoClient } from "@/lib/supabase/types"
import { canEdit, type Platform, type WorkspaceRole } from "@/types/aso"

export const ACTIVE_APP_COOKIE = "aso_active_app"

export interface WorkspaceSummary {
  id: string
  name: string
  isDemo: boolean
  role: WorkspaceRole
}

export interface AppSummary {
  id: string
  workspaceId: string
  name: string
  slug: string
  iconUrl: string | null
  defaultCountry: string
  defaultLanguage: string
  platforms: Platform[]
}

export interface DashboardContext {
  user: SessionUser
  db: AsoClient
  workspaces: WorkspaceSummary[]
  apps: AppSummary[]
  activeApp: AppSummary | null
  activeWorkspace: WorkspaceSummary | null
}

export interface ActiveAppContext extends DashboardContext {
  activeApp: AppSummary
  activeWorkspace: WorkspaceSummary
  role: WorkspaceRole
  canEdit: boolean
  isDemo: boolean
}

/**
 * Everything the dashboard shell needs, resolved once per request. RLS guarantees
 * only the user's own workspaces/apps are visible; the active-app cookie is only a
 * preference and is validated against that list.
 */
export const getDashboardContext = cache(async (): Promise<DashboardContext> => {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  const db = await getSupabase()

  const [membershipsResult, appsResult, cookieStore] = await Promise.all([
    db
      .from("workspace_members")
      .select("role, workspace:workspaces(id, name, is_demo)")
      .eq("user_id", user.id),
    db
      .from("apps")
      .select(
        "id, workspace_id, name, slug, icon_url, default_country, default_language, store_listings(platform)",
      )
      .order("created_at", { ascending: true }),
    cookies(),
  ])

  if (membershipsResult.error)
    throw new Error(`Failed to load workspaces: ${membershipsResult.error.message}`)
  if (appsResult.error) throw new Error(`Failed to load apps: ${appsResult.error.message}`)

  const workspaces: WorkspaceSummary[] = membershipsResult.data
    .flatMap((m) =>
      m.workspace
        ? [
            {
              id: m.workspace.id,
              name: m.workspace.name,
              isDemo: m.workspace.is_demo,
              role: m.role,
            },
          ]
        : [],
    )
    .sort((a, b) => Number(a.isDemo) - Number(b.isDemo) || a.name.localeCompare(b.name))

  const apps: AppSummary[] = appsResult.data.map((a) => ({
    id: a.id,
    workspaceId: a.workspace_id,
    name: a.name,
    slug: a.slug,
    iconUrl: a.icon_url,
    defaultCountry: a.default_country,
    defaultLanguage: a.default_language,
    platforms: [...new Set(a.store_listings.map((l) => l.platform))].sort(),
  }))

  const preferredId = cookieStore.get(ACTIVE_APP_COOKIE)?.value
  const demoWorkspaceIds = new Set(workspaces.filter((w) => w.isDemo).map((w) => w.id))
  const activeApp =
    apps.find((a) => a.id === preferredId) ??
    apps.find((a) => !demoWorkspaceIds.has(a.workspaceId)) ??
    apps[0] ??
    null
  const activeWorkspace = activeApp
    ? (workspaces.find((w) => w.id === activeApp.workspaceId) ?? null)
    : null

  return { user, db, workspaces, apps, activeApp, activeWorkspace }
})

/** For dashboard pages: requires an app, otherwise sends the user to onboarding. */
export async function requireActiveApp(): Promise<ActiveAppContext> {
  const context = await getDashboardContext()
  if (!context.activeApp || !context.activeWorkspace) redirect("/onboarding")
  const role = context.activeWorkspace.role
  return {
    ...context,
    activeApp: context.activeApp,
    activeWorkspace: context.activeWorkspace,
    role,
    canEdit: canEdit(role),
    isDemo: context.activeWorkspace.isDemo,
  }
}

export class AuthorizationError extends Error {
  override name = "AuthorizationError"
}

/** For Server Actions that modify the active app. */
export async function requireEditableApp(): Promise<ActiveAppContext> {
  const context = await getDashboardContext()
  if (!context.activeApp || !context.activeWorkspace) throw new AuthorizationError("No active app")
  const role = context.activeWorkspace.role
  if (!canEdit(role)) throw new AuthorizationError("Your role is read-only in this workspace")
  return {
    ...context,
    activeApp: context.activeApp,
    activeWorkspace: context.activeWorkspace,
    role,
    canEdit: true,
    isDemo: context.activeWorkspace.isDemo,
  }
}
