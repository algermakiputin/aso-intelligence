"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getRankProvider } from "@/lib/stores/registry"
import { AuthorizationError, requireEditableApp } from "../workspaces/context"
import { collectKeywordRanks, type CollectSummary } from "./collector"

/** Keywords per Server Action call. ~3 s each (Apple rate limit) keeps requests short. */
const BATCH_SIZE = 5
const SINGLE_CHECK_COOLDOWN_MS = 10 * 60_000

export type RefreshResult = ({ ok: true } & CollectSummary) | { ok: false; message: string }

function demoMessage(): RefreshResult {
  return {
    ok: false,
    message: "This is a demo app with synthetic data, so rank checks are disabled.",
  }
}

/** One batch of a manual refresh. The client calls it repeatedly to show progress. */
export async function refreshRankingsBatch(input: {
  runId: string | null
}): Promise<RefreshResult> {
  const runId = input.runId === null ? null : (z.uuid().safeParse(input.runId).data ?? null)
  try {
    const ctx = await requireEditableApp()
    if (ctx.isDemo) return demoMessage()
    const summary = await collectKeywordRanks(
      ctx.db,
      { getRankProvider },
      {
        appId: ctx.activeApp.id,
        trigger: "manual",
        mode: "manual",
        limit: BATCH_SIZE,
        runId,
        triggeredBy: ctx.user.id,
      },
    )
    if (summary.checked > 0) revalidatePath("/dashboard", "layout")
    return { ok: true, ...summary }
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, message: error.message }
    throw error
  }
}

/** "Check now" for a single keyword, regardless of schedule (with a short cooldown). */
export async function checkKeywordNow(keywordId: string): Promise<RefreshResult> {
  if (!z.uuid().safeParse(keywordId).success) return { ok: false, message: "Unknown keyword" }
  try {
    const ctx = await requireEditableApp()
    if (ctx.isDemo) return demoMessage()

    const { data: latest } = await ctx.db
      .from("keyword_rank_history")
      .select("checked_at")
      .eq("keyword_id", keywordId)
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latest && Date.now() - new Date(latest.checked_at).getTime() < SINGLE_CHECK_COOLDOWN_MS) {
      return {
        ok: false,
        message: "Checked in the last 10 minutes. Rankings rarely move that fast; try again later.",
      }
    }

    const summary = await collectKeywordRanks(
      ctx.db,
      { getRankProvider },
      {
        appId: ctx.activeApp.id,
        trigger: "manual",
        mode: "manual",
        keywordIds: [keywordId],
        force: true,
        limit: 1,
        triggeredBy: ctx.user.id,
      },
    )
    revalidatePath("/dashboard", "layout")
    return { ok: true, ...summary }
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, message: error.message }
    throw error
  }
}
