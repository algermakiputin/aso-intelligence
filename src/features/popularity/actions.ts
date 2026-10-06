"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getPopularityProvider } from "@/lib/stores/registry"
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

/** Pulls Apple Ads popularity for all tracked iOS keywords of the active app. */
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
    let belowThreshold = 0
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
      if (!result.ok) return errorState(result.error.message)
      const byTerm = new Map(result.data.observations.map((o) => [o.term, o]))
      const rows = group.flatMap((k) => {
        const o = byTerm.get(k.keyword)
        if (!o) return []
        if (o.status === "measured") measured++
        else belowThreshold++
        return [
          {
            keyword_id: k.id,
            status: o.status,
            popularity_score: o.score,
            source: result.data.source,
            granularity: o.granularity,
            period_start: o.periodStart,
            period_end: o.periodEnd,
            measured_at: o.measuredAt.toISOString(),
            created_by: user.id,
          },
        ]
      })
      const { error: insertError } = await db.from("keyword_popularity_history").insert(rows)
      if (insertError)
        return errorState(databaseErrorMessage(insertError, "Couldn't save popularity."))
    }
    revalidatePath("/dashboard", "layout")
    return {
      status: "success",
      message: `Popularity updated: ${measured} measured, ${belowThreshold} below Apple's threshold.`,
    }
  } catch (error) {
    if (error instanceof AuthorizationError) return errorState(error.message)
    throw error
  }
}
