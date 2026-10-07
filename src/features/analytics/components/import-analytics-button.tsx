"use client"

import { DownloadCloud } from "lucide-react"
import { useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { importAnalyticsAction } from "../actions"

export function ImportAnalyticsButton({
  variant = "outline",
}: {
  variant?: "outline" | "default"
}) {
  const [pending, startTransition] = useTransition()
  const run = () =>
    startTransition(async () => {
      const result = await importAnalyticsAction()
      if (result.status === "success") toast.success(result.message ?? "Imported")
      else if (result.status === "error") toast.error(result.message)
    })
  return (
    <Button variant={variant} size="sm" onClick={run} disabled={pending}>
      {pending ? <Spinner /> : <DownloadCloud />}
      Import from App Store Connect
    </Button>
  )
}
