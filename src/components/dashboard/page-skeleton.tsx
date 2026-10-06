import { Skeleton } from "@/components/ui/skeleton"
import { PageContainer } from "./panel"

/** Shown on navigation only (loading.tsx). Mirrors the page structure to avoid layout jumps. */
export function PageSkeleton({
  variant = "dashboard",
}: {
  variant?: "dashboard" | "table" | "detail"
}) {
  return (
    <PageContainer aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {variant !== "table" ? <Skeleton className="h-[92px] w-full rounded-lg" /> : null}
      {variant === "table" ? (
        <>
          <div className="flex gap-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-7 w-32" />
          </div>
          <div className="space-y-px overflow-hidden rounded-lg border">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-none" />
            ))}
          </div>
        </>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <Skeleton className="h-80 rounded-lg" />
          <Skeleton className="h-80 rounded-lg" />
        </div>
      )}
    </PageContainer>
  )
}
