"use client"

import { Button } from "@/components/ui/button"

export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  const isConfig = error.name === "EnvError" || error.message.includes("not configured")
  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-4 px-6">
      <h1 className="text-lg font-semibold tracking-tight">
        {isConfig ? "Setup needed" : "Something went wrong"}
      </h1>
      <p className="text-sm text-muted-foreground">
        {isConfig
          ? error.message
          : "The request failed before the page could render. Nothing was changed. Try again in a moment."}
      </p>
      {error.digest ? (
        <p className="font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
      ) : null}
      <div>
        <Button variant="outline" onClick={() => retry()}>
          Try again
        </Button>
      </div>
    </main>
  )
}
