"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import {
  type ActionState,
  databaseErrorMessage,
  errorState,
  validationError,
} from "@/lib/validation/action-state"
import {
  countryCodeSchema,
  formOptionalString,
  formString,
  platformSchema,
  uuidSchema,
} from "@/lib/validation/common"
import { ASO_EVENT_TYPES } from "@/types/aso"
import { AuthorizationError, requireEditableApp } from "../workspaces/context"
import { EVENT_DEFAULT_TITLES, TEXT_CHANGE_TYPES } from "./model"

const eventSchema = z.object({
  type: z.enum(ASO_EVENT_TYPES, { message: "Choose what changed" }),
  platform: z.union([z.literal("all"), platformSchema]),
  country: z.union([z.literal("all"), countryCodeSchema]),
  happenedOn: z.iso.date({ message: "Pick the date of the change" }),
  title: z.string().trim().max(200).optional(),
  before: z.string().max(4000).optional(),
  after: z.string().max(4000).optional(),
  description: z.string().max(5000).optional(),
})

export async function createEventAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = eventSchema.safeParse({
    type: formString(formData, "type"),
    platform: formString(formData, "platform") || "all",
    country: formString(formData, "country") || "all",
    happenedOn: formString(formData, "happenedOn"),
    title: formOptionalString(formData, "title"),
    before: formOptionalString(formData, "before"),
    after: formOptionalString(formData, "after"),
    description: formOptionalString(formData, "description"),
  })
  if (!parsed.success) return validationError(parsed.error)
  const v = parsed.data
  const happenedAt = new Date(`${v.happenedOn}T12:00:00Z`)
  if (happenedAt.getTime() > Date.now() + 24 * 3_600_000) {
    return errorState("Record changes after they happen.", {
      happenedOn: ["Can't be in the future"],
    })
  }

  const isText = TEXT_CHANGE_TYPES.has(v.type)
  try {
    const { db, activeApp, user } = await requireEditableApp()
    const { error } = await db.from("aso_events").insert({
      app_id: activeApp.id,
      platform: v.platform === "all" ? null : v.platform,
      country: v.country === "all" ? null : v.country,
      event_type: v.type,
      title: v.title || EVENT_DEFAULT_TITLES[v.type],
      description: v.description ?? null,
      before_data: isText && v.before ? { text: v.before } : null,
      after_data: isText && v.after ? { text: v.after } : null,
      happened_at: happenedAt.toISOString(),
      source: "manual",
      created_by: user.id,
    })
    if (error) return errorState(databaseErrorMessage(error, "Couldn't record the change."))
    revalidatePath("/dashboard", "layout")
    return { status: "success", message: "Change recorded." }
  } catch (error) {
    if (error instanceof AuthorizationError) return errorState(error.message)
    throw error
  }
}

export async function deleteEventAction(eventId: string): Promise<ActionState> {
  if (!uuidSchema.safeParse(eventId).success) return errorState("Event not found.")
  try {
    const { db, activeApp } = await requireEditableApp()
    const { error } = await db
      .from("aso_events")
      .delete()
      .eq("app_id", activeApp.id)
      .eq("id", eventId)
    if (error) return errorState(databaseErrorMessage(error, "Couldn't delete the event."))
    revalidatePath("/dashboard", "layout")
    return { status: "success", message: "Event deleted." }
  } catch (error) {
    if (error instanceof AuthorizationError) return errorState(error.message)
    throw error
  }
}
