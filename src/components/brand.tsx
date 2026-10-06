import { cn } from "@/lib/utils"

/** Mark: a short list of search results with the top result highlighted. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={cn("size-5", className)}>
      <rect x="2" y="3" width="16" height="3" rx="1.5" className="fill-data" />
      <rect x="2" y="8.5" width="11" height="3" rx="1.5" className="fill-muted-foreground/45" />
      <rect x="2" y="14" width="7" height="3" rx="1.5" className="fill-muted-foreground/25" />
    </svg>
  )
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 text-sm font-semibold tracking-tight", className)}>
      <BrandMark />
      ASO Intelligence
    </span>
  )
}
