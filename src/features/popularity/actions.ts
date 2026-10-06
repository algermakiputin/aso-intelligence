"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getPopularityProvider } from "@/lib/stores/registry"
import type { Json } from "@/lib/supabase/database.types"
import {
  type ActionState,
  databaseErrorMessage,
  errorState,
  validationError,
} from "@/lib/validation/action-state"
import { formString, uuidSchema } from "@/lib/validation/common"
import { listListings } from "../listings/data"
import { selectListing } from "../listings/model"
import { AuthorizationError, requireEditableApp } from "../workspaces/context"

const manualSchema = z.object({
  keywordId: uuidSchema,
  score: z.coerce
    .number()
    .min(1, "Apple popularity ranges from 1 to 100")
    .max(100, "Apple popularity ranges from 1 to 100"),
  measuredOn: z.iso.date({ message: "Pick a date" }),
})

/** Records a popularity value read elsewhere (e.g. the Apple Ads UI), labelled as manual. */
export async function recordManualPopularityAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = manualSchema.safeParse({
    keywordId: formString(formData, "keywordId"),
    score: formString(formData, "score"),
    measuredOn: formString(formData, "measuredOn"),
  })
  if (!parsed.success) return validationError(parsed.error)
  if (new Date(parsed.data.measuredOn) > new Date())
    return errorState("The date can't be in the future.", {
      measuredOn: ["Can't be in the future"],
    })

  try {
    const { db, activeApp, user } = await requireEditableApp()
    const { data: keyword } = await db
      .from("keywords")
      .select("id")
      .eq("app_id", activeApp.id)
      .eq("id", parsed.data.keywordId)
      .maybeSingle()
    if (!keyword) return errorState("Keyword not found.")

    const { error } = await db.from("keyword_popularity_history").insert({
      keyword_id: keyword.id,
      status: "measured",
      popularity_score: parsed.data.score,
      source: "manual",
      granularity: "point",
      measured_at: new Date(`${parsed.data.measuredOn}T12:00:00Z`).toISOString(),
      created_by: user.id,
    })
    if (error) return errorState(databaseErrorMessage(error, "Couldn't save the popularity value."))
    revalidatePath("/dashboard", "layout")
    return { status: "success", message: "Popularity recorded." }
  } catch (error) {
    if (error instanceof AuthorizationError) return errorState(error.message)
    throw error
  }
}

/**
 * Pulls Apple Ads Search Term Popularity for all tracked iOS keywords of the active app.
 * Not wired into the UI in V0.1; kept so the provider can be exercised once connected.
 *
 * Per storefront: terms Apple returns are recorded as measured, terms it doesn't return
 * as `below_threshold` (never zero). When Apple has no data for the storefront and period,
 * nothing is recorded. Periods that are already recorded are skipped, so history stays
 * append-only and a repeat sync is harmless.
 */
export async function syncPopularityAction(): Promise<ActionState> {
  try {
    const { db, activeApp, user, isDemo } = await requireEditableApp()
    if (isDemo) return errorState("This is a demo app with synthetic data.")
    const provider = getPopularityProvider("ios")
    if (!provider || provider.status().state !== "ready")
      return errorState("Apple keyword popularity not connected.")

    const [{ data: keywords, error }, listings] = await Promise.all([
      db
        .from("keywords")
        .select("id, keyword, country, language")
        .eq("app_id", activeApp.id)
        .eq("platform", "ios")
        .eq("tracked", true),
      listListings(db, activeApp.id),
    ])
    if (error) return errorState("Couldn't load keywords.")
    if (keywords.length === 0) return errorState("No tracked iOS keywords.")

    const byCountry = Map.groupBy(keywords, (k) => k.country)
    let measured = 0
    let notReturned = 0
    let alreadyRecorded = 0
    const unavailable: string[] = []
    for (const [country, group] of byCountry) {
      const listing = selectListing(listings, {
        platform: "ios",
        country,
        language: group[0]!.language,
      })?.listing
      const result = await provider.getPopularity({
        platform: "ios",
        country,
        terms: group.map((k) => k.keyword),
        genre: listing?.primaryCategory ?? null,
      })
      if (!result.ok) {
        if (result.error.code === "unavailable") {
          unavailable.push(country)
          continue
        }
        return errorState(result.error.message)
      }
      const { period, observations, source } = result.data
      if (!period) continue

      const { data: existing, error: existingError } = await db
        .from("keyword_popularity_history")
        .select("keyword_id")
        .in(
          "keyword_id",
          group.map((k) => k.id),
        )
        .eq("source", source)
        .eq("granularity", period.granularity)
        .eq("period_start", period.start)
      if (existingError) return errorState("Couldn't load existing popularity.")
      const recorded = new Set(existing.map((e) => e.keyword_id))

      const byTerm = new Map(observations.map((o) => [o.term, o]))
      const rows = group.flatMap((k) => {
        const o = byTerm.get(k.keyword)
        if (!o) return []
        if (recorded.has(k.id)) {
          alreadyRecorded++
          return []
        }
        if (o.status === "measured") measured++
        else notReturned++
        return [
          {
            keyword_id: k.id,
            status: o.status,
            popularity_score: o.score,
            source,
            granularity: o.granularity,
            period_start: o.periodStart,
            period_end: o.periodEnd,
            measured_at: o.measuredAt.toISOString(),
            details: o.details as { [key: string]: Json | undefined },
            created_by: user.id,
          },
        ]
      })
      if (rows.length === 0) continue
      const { error: insertError } = await db.from("keyword_popularity_history").insert(rows)
      if (insertError)
        return errorState(databaseErrorMessage(insertError, "Couldn't save popularity."))
    }
    revalidatePath("/dashboard", "layout")
    const parts = [
      `${measured} measured`,
      `${notReturned} not returned by Apple`,
      alreadyRecorded > 0 ? `${alreadyRecorded} already recorded for this period` : null,
      unavailable.length > 0 ? `no Apple data yet for ${unavailable.join(", ")}` : null,
    ].filter(Boolean)
    return { status: "success", message: `Popularity updated: ${parts.join(", ")}.` }
  } catch (error) {
    if (error instanceof AuthorizationError) return errorState(error.message)
    throw error
  }
}
