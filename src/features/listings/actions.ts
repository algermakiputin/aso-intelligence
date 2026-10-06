"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import type { TableInsert } from "@/lib/supabase/types"
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
  normalizeText,
  platformSchema,
  uuidSchema,
} from "@/lib/validation/common"
import { parseAppStoreId, parsePlayPackage } from "@/lib/validation/store-ids"
import type { AsoEventType } from "@/types/aso"
import { AuthorizationError, requireEditableApp } from "../workspaces/context"
import { getListing } from "./data"
import { syncListingFromStore } from "./sync"

function handle(error: unknown): ActionState {
  if (error instanceof AuthorizationError) return errorState(error.message)
  throw error
}

const metadataSchema = z.object({
  listingId: uuidSchema,
  title: z.string().max(255),
  subtitle: z.string().max(255),
  keywordField: z.string().max(100, "The App Store keyword field is limited to 100 characters"),
  description: z.string().max(10000),
  recordEvents: z.boolean(),
})

const FIELD_EVENTS: Array<{
  key: "title" | "subtitle" | "keywordField" | "description"
  type: AsoEventType
  label: string
}> = [
  { key: "title", type: "title_change", label: "Title changed" },
  { key: "subtitle", type: "subtitle_change", label: "Subtitle changed" },
  { key: "keywordField", type: "keyword_change", label: "Keyword field updated" },
  { key: "description", type: "description_change", label: "Description changed" },
]

/**
 * Records the metadata that is live in the store. This never publishes anything to
 * App Store Connect or Google Play; it only updates our copy (and history).
 */
export async function updateListingMetadataAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = metadataSchema.safeParse({
    listingId: formString(formData, "listingId"),
    title: formString(formData, "title"),
    subtitle: formString(formData, "subtitle"),
    keywordField: formString(formData, "keywordField"),
    description: formString(formData, "description"),
    recordEvents: formBoolean(formData, "recordEvents"),
  })
  if (!parsed.success) return validationError(parsed.error)

  try {
    const { db, activeApp, user } = await requireEditableApp()
    const listing = await getListing(db, activeApp.id, parsed.data.listingId)
    if (!listing) return errorState("Listing not found.")

    const next = {
      title: parsed.data.title || null,
      subtitle: parsed.data.subtitle || null,
      keywordField: listing.platform === "ios" ? parsed.data.keywordField || null : null,
      description: parsed.data.description || null,
    }
    const current = (key: (typeof FIELD_EVENTS)[number]["key"]) =>
      listing[key] === null ? null : normalizeText(listing[key]) || null
    const changed = FIELD_EVENTS.filter(({ key }) => current(key) !== next[key])
    if (changed.length === 0) return { status: "success", message: "No changes." }

    const { error } = await db
      .from("store_listings")
      .update({
        title: next.title,
        subtitle_or_short_description: next.subtitle,
        keyword_field: next.keywordField,
        description: next.description,
        metadata_source: "manual",
      })
      .eq("id", listing.id)
    if (error) return errorState(databaseErrorMessage(error, "Couldn't save the metadata."))

    if (parsed.data.recordEvents) {
      const now = new Date().toISOString()
      const events: TableInsert<"aso_events">[] = changed
        // First-time entry isn't a change worth annotating.
        .filter(({ key }) => listing[key] !== null)
        .map(({ key, type, label }) => ({
          app_id: activeApp.id,
          platform: listing.platform,
          country: listing.country,
          event_type: type,
          title: label,
          before_data: { text: listing[key] },
          after_data: { text: next[key] },
          happened_at: now,
          source: "manual",
          created_by: user.id,
        }))
      if (events.length > 0) await db.from("aso_events").insert(events)
    }

    revalidatePath("/dashboard", "layout")
    return { status: "success", message: "Listing metadata saved." }
  } catch (error) {
    return handle(error)
  }
}

export async function syncListingAction(listingId: string): Promise<ActionState> {
  if (!uuidSchema.safeParse(listingId).success) return errorState("Listing not found.")
  try {
    const { db, activeApp, user } = await requireEditableApp()
    const listing = await getListing(db, activeApp.id, listingId)
    if (!listing) return errorState("Listing not found.")
    const outcome = await syncListingFromStore(db, listing, { userId: user.id })
    if (!outcome.ok) return errorState(outcome.message)
    revalidatePath("/dashboard", "layout")
    return {
      status: "success",
      message:
        outcome.detectedChanges.length > 0
          ? `Imported. Recorded on the timeline: ${outcome.detectedChanges.join(", ")}.`
          : "Imported the live listing metadata.",
    }
  } catch (error) {
    return handle(error)
  }
}

const addListingSchema = z
  .object({
    platform: platformSchema,
    externalId: z.string(),
    bundleId: z.string().trim().max(255),
    country: countryCodeSchema,
    language: languageSchema,
  })
  .superRefine((v, ctx) => {
    const ok = v.platform === "ios" ? parseAppStoreId(v.externalId) : parsePlayPackage(v.externalId)
    if (!ok)
      ctx.addIssue({
        code: "custom",
        path: ["externalId"],
        message:
          v.platform === "ios"
            ? "Enter the numeric App Store ID or URL"
            : "Enter the package name or Play Store URL",
      })
  })

export async function addListingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = addListingSchema.safeParse({
    platform: formString(formData, "platform"),
    externalId: formString(formData, "externalId"),
    bundleId: formString(formData, "bundleId"),
    country: formString(formData, "country"),
    language: formString(formData, "language"),
  })
  if (!parsed.success) return validationError(parsed.error)
  try {
    const { db, activeApp } = await requireEditableApp()
    const v = parsed.data
    const externalId = (
      v.platform === "ios" ? parseAppStoreId(v.externalId) : parsePlayPackage(v.externalId)
    )!
    const { error } = await db.from("store_listings").insert({
      app_id: activeApp.id,
      platform: v.platform,
      external_app_id: externalId,
      package_or_bundle_id: v.platform === "android" ? externalId : v.bundleId || null,
      country: v.country,
      language: v.language,
    })
    if (error) {
      return errorState(
        error.code === "23505"
          ? "A listing for that platform and storefront already exists."
          : databaseErrorMessage(error, "Couldn't add the listing."),
      )
    }
    revalidatePath("/dashboard", "layout")
    return { status: "success", message: "Listing added." }
  } catch (error) {
    return handle(error)
  }
}

export async function deleteListingAction(listingId: string): Promise<ActionState> {
  if (!uuidSchema.safeParse(listingId).success) return errorState("Listing not found.")
  try {
    const { db, activeApp } = await requireEditableApp()
    const { error } = await db
      .from("store_listings")
      .delete()
      .eq("app_id", activeApp.id)
      .eq("id", listingId)
    if (error) return errorState(databaseErrorMessage(error, "Couldn't remove the listing."))
    revalidatePath("/dashboard", "layout")
    return { status: "success", message: "Listing removed." }
  } catch (error) {
    return handle(error)
  }
}
