import Link from "next/link"
import { BrandWordmark } from "@/components/brand"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-4 px-6">
      <BrandWordmark />
      <h1 className="text-lg font-semibold tracking-tight">Page not found</h1>
      <p className="text-sm text-muted-foreground">
        The address may be mistyped, or the page was moved.
      </p>
      <div>
        <Button asChild variant="outline">
          <Link href="/dashboard">Go to the dashboard</Link>
        </Button>
      </div>
    </main>
  )
}
