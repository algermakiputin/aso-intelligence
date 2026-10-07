"use server"

import { revalidatePath } from "next/cache"
import { getAnalyticsProvider } from "@/lib/stores/registry"
import { type ActionState, errorState } from "@/lib/validation/action-state"
import { AuthorizationError, requireEditableApp } from "../workspaces/context"
import { importStoreAnalytics } from "./collector"

/** Manual import: a bounded batch so the request stays short; run again for more. */
const MANUAL_LIMIT = 10
const MANUAL_BUDGET_MS = 40_000

export async function importAnalyticsAction(): Promise<ActionState> {
  try {
    const { db, activeApp, user, isDemo } = await requireEditableApp()
    if (isDemo) return errorState("This is a demo app with synthetic data.")
    const result = await importStoreAnalytics(
      db,
      { getAnalyticsProvider },
      {
        appId: activeApp.id,
        trigger: "manual",
        triggeredBy: user.id,
        limit: MANUAL_LIMIT,
        deadline: Date.now() + MANUAL_BUDGET_MS,
      },
    )
    revalidatePath("/dashboard/analytics")
    switch (result.status) {
      case "imported":
      case "partial": {
        const message =
          `Imported ${result.imported} ${result.imported === 1 ? "report" : "reports"}` +
          (result.remaining > 0 ? `; ${result.remaining} left, run the import again.` : ".")
        return result.status === "imported"
          ? { status: "success", message }
          : errorState(`${message} Some failed: ${result.message ?? "unknown error"}`)
      }
      case "up_to_date":
        return { status: "success", message: "Already up to date." }
      case "waiting_for_store":
        return {
          status: "success",
          message: result.requestCreated
            ? "Apple's reports are requested. The first ones arrive in 1–2 days."
            : (result.message ?? "Apple hasn't delivered any reports yet."),
        }
      default:
        return errorState(result.message ?? "Couldn't import analytics.")
    }
  } catch (error) {
    if (error instanceof AuthorizationError) return errorState(error.message)
    throw error
  }
}
