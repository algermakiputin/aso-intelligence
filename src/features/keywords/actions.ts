"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { parseKeywordList } from "@/lib/aso/normalization/text"
import {
  type ActionState,
  databaseErrorMessage,
  errorState,
  validationError,
} from "@/lib/validation/action-state"
import {
  countryCodeSchema,
  formBoolean,
  formOptionalString,
  formString,
  languageSchema,
  platformSchema,
  relevanceSchema,
  uuidSchema,
} from "@/lib/validation/common"
import { AuthorizationError, requireEditableApp } from "../workspaces/context"

const MAX_KEYWORDS_PER_ADD = 200

const addKeywordsSchema = z.object({
  keywords: z.string().min(1, "Enter at least one keyword"),
  platform: platformSchema,
  country: countryCodeSchema,
  language: languageSchema,
  relevance: relevanceSchema.optional(),
  isPriority: z.boolean(),
})

export type AddKeywordsResult = ActionState<{ added: number; existing: string[]; tooLong: number }>

export async function addKeywordsAction(
  _prev: AddKeywordsResult,
  formData: FormData,
): Promise<AddKeywordsResult> {
  const parsed = addKeywordsSchema.safeParse({
    keywords: formString(formData, "keywords"),
    platform: formString(formData, "platform"),
    country: formString(formData, "country"),
    language: formString(formData, "language"),
    relevance:
      formString(formData, "relevance") === "unset"
        ? undefined
        : formOptionalString(formData, "relevance"),
    isPriority: formBoolean(formData, "isPriority"),
  })
  if (!parsed.success) return validationError(parsed.error)

  const list = parseKeywordList(parsed.data.keywords)
  if (list.keywords.length === 0)
    return errorState("Enter at least one keyword.", { keywords: ["Enter at least one keyword"] })
  if (list.keywords.length > MAX_KEYWORDS_PER_ADD) {
    return errorState(`Add up to ${MAX_KEYWORDS_PER_ADD} keywords at a time.`)
  }

  try {
    const { db, activeApp, user } = await requireEditableApp()
    const { platform, country, language, relevance, isPriority } = parsed.data

    const { data: inserted, error } = await db
      .from("keywords")
      .upsert(
        list.keywords.map((keyword) => ({
          app_id: activeApp.id,
          keyword,
          platform,
          country,
          language,
          relevance_score: relevance ?? null,
          is_priority: isPriority,
          created_by: user.id,
        })),
        { onConflict: "app_id,platform,country,language,keyword", ignoreDuplicates: true },
      )
      .select("keyword")
    if (error) return errorState(databaseErrorMessage(error, "Couldn't add the keywords."))

    const added = new Set(inserted.map((k) => k.keyword))
    const existing = list.keywords.filter((k) => !added.has(k))
    revalidatePath("/dashboard", "layout")
    return {
      status: "success",
      message: `Added ${added.size} ${added.size === 1 ? "keyword" : "keywords"}.`,
      data: { added: added.size, existing, tooLong: list.tooLong.length },
    }
  } catch (error) {
    if (error instanceof AuthorizationError) return errorState(error.message)
    throw error
  }
}

const idsSchema = z.array(uuidSchema).min(1).max(1000)

export type BulkResult = { ok: true; count: number } | { ok: false; message: string }

async function bulk(
  ids: string[],
  apply: (
    ctx: Awaited<ReturnType<typeof requireEditableApp>>,
    ids: string[],
  ) => Promise<{ count: number; error: unknown }>,
): Promise<BulkResult> {
  const parsed = idsSchema.safeParse(ids)
  if (!parsed.success) return { ok: false, message: "Select at least one keyword." }
  try {
    const ctx = await requireEditableApp()
    const { count, error } = await apply(ctx, parsed.data)
    if (error) return { ok: false, message: "The change couldn't be saved." }
    revalidatePath("/dashboard", "layout")
    return { ok: true, count }
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, message: error.message }
    throw error
  }
}

export async function setKeywordsTracked(ids: string[], tracked: boolean): Promise<BulkResult> {
  return bulk(ids, async ({ db, activeApp }, valid) => {
    const { data, error } = await db
      .from("keywords")
      .update({ tracked })
      .eq("app_id", activeApp.id)
      .in("id", valid)
      .select("id")
    return { count: data?.length ?? 0, error }
  })
}

export async function setKeywordsPriority(ids: string[], isPriority: boolean): Promise<BulkResult> {
  return bulk(ids, async ({ db, activeApp }, valid) => {
    const { data, error } = await db
      .from("keywords")
      .update({ is_priority: isPriority })
      .eq("app_id", activeApp.id)
      .in("id", valid)
      .select("id")
    return { count: data?.length ?? 0, error }
  })
}

export async function deleteKeywords(ids: string[]): Promise<BulkResult> {
  return bulk(ids, async ({ db, activeApp }, valid) => {
    const { data, error } = await db
      .from("keywords")
      .delete()
      .eq("app_id", activeApp.id)
      .in("id", valid)
      .select("id")
    return { count: data?.length ?? 0, error }
  })
}

const updateKeywordSchema = z.object({
  id: uuidSchema,
  relevance: z.union([z.literal(""), relevanceSchema]),
  notes: z.string().max(2000, "Notes are limited to 2,000 characters"),
  isPriority: z.boolean(),
})

export async function updateKeywordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = updateKeywordSchema.safeParse({
    id: formString(formData, "id"),
    relevance:
      formString(formData, "relevance") === "unset" ? "" : formString(formData, "relevance"),
    notes: formString(formData, "notes"),
    isPriority: formBoolean(formData, "isPriority"),
  })
  if (!parsed.success) return validationError(parsed.error)
  try {
    const { db, activeApp } = await requireEditableApp()
    const { id, relevance, notes, isPriority } = parsed.data
    const { error } = await db
      .from("keywords")
      .update({
        relevance_score: relevance === "" ? null : relevance,
        notes: notes || null,
        is_priority: isPriority,
      })
      .eq("app_id", activeApp.id)
      .eq("id", id)
    if (error) return errorState(databaseErrorMessage(error, "Couldn't save the keyword."))
    revalidatePath("/dashboard", "layout")
    return { status: "success", message: "Keyword updated." }
  } catch (error) {
    if (error instanceof AuthorizationError) return errorState(error.message)
    throw error
  }
}

export async function deleteKeywordAndReturn(id: string): Promise<BulkResult> {
  const result = await deleteKeywords([id])
  if (result.ok) redirect("/dashboard/keywords")
  return result
}
