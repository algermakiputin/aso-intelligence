"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { z } from "zod"
import { slugify } from "@/lib/aso/normalization/text"
import { requireUser } from "@/lib/auth/session"
import {
  type ActionState,
  databaseErrorMessage,
  errorState,
  validationError,
} from "@/lib/validation/action-state"
import {
  countryCodeSchema,
  formBoolean,
  formString,
  languageSchema,
  platformSchema,
  uuidSchema,
} from "@/lib/validation/common"
import { parseAppStoreId, parsePlayPackage } from "@/lib/validation/store-ids"
import { canEdit } from "@/types/aso"
import { getListing } from "../listings/data"
import { syncListingFromStore } from "../listings/sync"
import {
  ACTIVE_APP_COOKIE,
  AuthorizationError,
  getDashboardContext,
  requireEditableApp,
} from "../workspaces/context"

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
} as const

const workspaceNameSchema = z
  .string()
  .trim()
  .min(1, "Name your workspace")
  .max(80, "Keep it under 80 characters")

export async function createWorkspaceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()
  const parsed = workspaceNameSchema.safeParse(formString(formData, "name"))
  if (!parsed.success)
    return validationError(
      new z.ZodError(parsed.error.issues.map((i) => ({ ...i, path: ["name"] }))),
    )

  const context = await getDashboardContext()
  const { error } = await context.db.rpc("create_workspace", { workspace_name: parsed.data })
  if (error) return errorState(databaseErrorMessage(error, "Couldn't create the workspace."))

  revalidatePath("/onboarding")
  redirect("/onboarding")
}

const createAppSchema = z
  .object({
    workspaceId: uuidSchema,
    name: z.string().trim().min(1, "Enter the app name").max(80),
    platforms: z.array(platformSchema).min(1, "Choose at least one platform"),
    appStoreId: z.string(),
    bundleId: z.string().trim().max(255),
    playPackage: z.string(),
    defaultCountry: countryCodeSchema,
    defaultLanguage: languageSchema,
    importMetadata: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.platforms.includes("ios") && !parseAppStoreId(value.appStoreId)) {
      ctx.addIssue({
        code: "custom",
        path: ["appStoreId"],
        message: "Enter the numeric App Store ID or the App Store URL",
      })
    }
    if (value.platforms.includes("android") && !parsePlayPackage(value.playPackage)) {
      ctx.addIssue({
        code: "custom",
        path: ["playPackage"],
        message: "Enter the package name (e.g. com.example.app) or Play Store URL",
      })
    }
  })

export async function createAppAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = createAppSchema.safeParse({
    workspaceId: formString(formData, "workspaceId"),
    name: formString(formData, "name"),
    platforms: formData.getAll("platforms").map(String),
    appStoreId: formString(formData, "appStoreId"),
    bundleId: formString(formData, "bundleId"),
    playPackage: formString(formData, "playPackage"),
    defaultCountry: formString(formData, "defaultCountry"),
    defaultLanguage: formString(formData, "defaultLanguage"),
    importMetadata: formBoolean(formData, "importMetadata"),
  })
  if (!parsed.success) return validationError(parsed.error)
  const input = parsed.data

  const context = await getDashboardContext()
  const workspace = context.workspaces.find((w) => w.id === input.workspaceId)
  if (!workspace || !canEdit(workspace.role))
    return errorState("You can't add apps to that workspace.")
  const { db, user } = context

  const baseSlug = slugify(input.name)
  const { data: taken } = await db
    .from("apps")
    .select("slug")
    .eq("workspace_id", workspace.id)
    .like("slug", `${baseSlug}%`)
  const takenSlugs = new Set((taken ?? []).map((a) => a.slug))
  let slug = baseSlug
  for (let n = 2; takenSlugs.has(slug); n++) slug = `${baseSlug}-${n}`

  const { data: app, error: appError } = await db
    .from("apps")
    .insert({
      workspace_id: workspace.id,
      name: input.name,
      slug,
      default_country: input.defaultCountry,
      default_language: input.defaultLanguage,
    })
    .select("id")
    .single()
  if (appError) return errorState(databaseErrorMessage(appError, "Couldn't create the app."))

  const listings = []
  if (input.platforms.includes("ios")) {
    listings.push({
      app_id: app.id,
      platform: "ios" as const,
      external_app_id: parseAppStoreId(input.appStoreId)!,
      package_or_bundle_id: input.bundleId || null,
      country: input.defaultCountry,
      language: input.defaultLanguage,
    })
  }
  if (input.platforms.includes("android")) {
    const pkg = parsePlayPackage(input.playPackage)!
    listings.push({
      app_id: app.id,
      platform: "android" as const,
      external_app_id: pkg,
      package_or_bundle_id: pkg,
      country: input.defaultCountry,
      language: input.defaultLanguage,
    })
  }
  const { data: created, error: listingError } = await db
    .from("store_listings")
    .insert(listings)
    .select("id, platform")
  if (listingError) {
    await db.from("apps").delete().eq("id", app.id)
    return errorState(databaseErrorMessage(listingError, "Couldn't create the store listing."))
  }

  const iosListingId = created.find((l) => l.platform === "ios")?.id
  if (input.importMetadata && iosListingId) {
    const listing = await getListing(db, app.id, iosListingId)
    if (listing) await syncListingFromStore(db, listing, { userId: user.id })
  }

  ;(await cookies()).set(ACTIVE_APP_COOKIE, app.id, COOKIE_OPTIONS)
  revalidatePath("/", "layout")
  redirect("/dashboard")
}

/** Switch the active app, then return to the same section of the dashboard. */
export async function switchActiveAppAction(formData: FormData): Promise<void> {
  const appId = formString(formData, "appId")
  const context = await getDashboardContext()
  if (!context.apps.some((a) => a.id === appId)) return

  ;(await cookies()).set(ACTIVE_APP_COOKIE, appId, COOKIE_OPTIONS)
  const returnTo = formString(formData, "returnTo")
  const section = returnTo.match(
    /^\/dashboard(\/(keywords|competitors|analytics|experiments|reviews|settings|apps))?/,
  )?.[0]
  revalidatePath("/dashboard", "layout")
  redirect(section ?? "/dashboard")
}

const updateAppSchema = z.object({
  name: z.string().trim().min(1, "Enter the app name").max(80),
  defaultCountry: countryCodeSchema,
  defaultLanguage: languageSchema,
})

export async function updateAppAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = updateAppSchema.safeParse({
    name: formString(formData, "name"),
    defaultCountry: formString(formData, "defaultCountry"),
    defaultLanguage: formString(formData, "defaultLanguage"),
  })
  if (!parsed.success) return validationError(parsed.error)
  try {
    const { db, activeApp } = await requireEditableApp()
    const { error } = await db
      .from("apps")
      .update({
        name: parsed.data.name,
        default_country: parsed.data.defaultCountry,
        default_language: parsed.data.defaultLanguage,
      })
      .eq("id", activeApp.id)
    if (error) return errorState(databaseErrorMessage(error, "Couldn't save the app."))
    revalidatePath("/dashboard", "layout")
    return { status: "success", message: "App details saved." }
  } catch (error) {
    if (error instanceof AuthorizationError) return errorState(error.message)
    throw error
  }
}

export async function deleteAppAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { db, activeApp } = await requireEditableApp()
    if (formString(formData, "confirm") !== activeApp.name) {
      return errorState(`Type "${activeApp.name}" to confirm.`, { confirm: ["Name doesn't match"] })
    }
    const { error } = await db.from("apps").delete().eq("id", activeApp.id)
    if (error) return errorState(databaseErrorMessage(error, "Couldn't delete the app."))
    ;(await cookies()).delete(ACTIVE_APP_COOKIE)
  } catch (error) {
    if (error instanceof AuthorizationError) return errorState(error.message)
    throw error
  }
  revalidatePath("/", "layout")
  redirect("/dashboard")
}
