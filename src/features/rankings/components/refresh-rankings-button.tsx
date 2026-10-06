"use client"

import { RefreshCw, Square } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { checkKeywordNow, refreshRankingsBatch } from "../actions"

const MAX_BATCHES = 100

/**
 * Runs a manual refresh in small batches so each request stays short and the user sees
 * progress. Stops when nothing is left, on rate limiting, when a batch makes no
 * progress, or when the user presses Stop.
 */
export function RefreshRankingsButton({
  disabled,
  disabledReason,
}: {
  disabled?: boolean
  disabledReason?: string
}) {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const stopRequested = useRef(false)

  const run = async () => {
    setRunning(true)
    stopRequested.current = false
    let runId: string | null = null
    let checked = 0
    let failed = 0
    let skipped = 0
    let total = 0
    let lastError: string | null = null

    try {
      for (let i = 0; i < MAX_BATCHES; i++) {
        const result = await refreshRankingsBatch({ runId })
        if (!result.ok) {
          toast.error(result.message)
          return
        }
        if (i === 0) {
          total = result.checked + result.failed + result.remaining
          skipped = result.skipped
        }
        runId = result.runId
        checked += result.checked
        failed += result.failed
        lastError = result.errors[0]?.message ?? lastError
        setProgress({ done: checked + failed, total })

        if (result.status === "nothing_due") break
        if (result.stoppedReason === "rate_limited") {
          toast.warning(
            "Apple is rate-limiting requests. Stopped early; try again in a few minutes.",
          )
          break
        }
        if (result.remaining === 0 || result.checked === 0 || stopRequested.current) break
      }

      if (total === 0) {
        toast.info("All tracked keywords were checked in the last 6 hours.", {
          description:
            skipped > 0
              ? `${skipped} keywords can't be checked (no listing or platform not supported yet).`
              : undefined,
        })
      } else if (failed > 0) {
        toast.warning(`Checked ${checked} of ${total} keywords. ${failed} failed.`, {
          description: lastError ?? undefined,
        })
      } else {
        toast.success(`Checked ${checked} ${checked === 1 ? "keyword" : "keywords"}.`, {
          description: stopRequested.current
            ? "Stopped before finishing. The rest will be checked next time."
            : undefined,
        })
      }
    } catch {
      toast.error("Refreshing rankings failed. Try again.")
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  if (running) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground tabular" aria-live="polite">
          {progress ? `Checking ${progress.done} of ${progress.total}…` : "Checking keywords…"}{" "}
          About 3 s per keyword, to respect Apple&apos;s rate limits.
        </span>
        <Button variant="outline" onClick={() => (stopRequested.current = true)}>
          <Square />
          Stop
        </Button>
      </div>
    )
  }

  const button = (
    <Button variant="outline" onClick={run} disabled={disabled}>
      <RefreshCw />
      Refresh rankings
    </Button>
  )
  if (!disabled || !disabledReason) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>{button}</span>
      </TooltipTrigger>
      <TooltipContent>{disabledReason}</TooltipContent>
    </Tooltip>
  )
}

export function CheckNowButton({ keywordId, disabled }: { keywordId: string; disabled?: boolean }) {
  const [running, setRunning] = useState(false)
  return (
    <Button
      variant="outline"
      disabled={disabled || running}
      onClick={async () => {
        setRunning(true)
        try {
          const result = await checkKeywordNow(keywordId)
          if (!result.ok) toast.error(result.message)
          else if (result.failed > 0)
            toast.error(result.errors[0]?.message ?? "The rank check failed.")
          else if (result.checked === 0)
            toast.info("This keyword can't be checked: no listing or platform not supported yet.")
          else toast.success("Rank checked.")
        } finally {
          setRunning(false)
        }
      }}
    >
      <RefreshCw className={running ? "animate-spin" : undefined} />
      {running ? "Checking…" : "Check rank now"}
    </Button>
  )
}
