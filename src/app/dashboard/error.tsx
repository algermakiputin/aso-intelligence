"use client"

import { AlertTriangle } from "lucide-react"
import { EmptyState } from "@/components/dashboard/empty-state"
import { PageContainer } from "@/components/dashboard/panel"
import { Button } from "@/components/ui/button"

export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <PageContainer>
      <div className="rounded-lg border bg-card">
        <EmptyState
          icon={AlertTriangle}
          title="This page couldn't load"
          description={
            <>
              The data request failed. Your data is safe; nothing was changed. Try again, and if it
              keeps happening check that Supabase is running.
              {error.digest ? (
                <span className="mt-2 block font-mono text-xs">Reference: {error.digest}</span>
              ) : null}
            </>
          }
        >
          <Button variant="outline" onClick={() => retry()}>
            Try again
          </Button>
        </EmptyState>
      </div>
    </PageContainer>
  )
}
