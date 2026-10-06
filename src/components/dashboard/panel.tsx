import type * as React from "react"
import { cn } from "@/lib/utils"

/**
 * The primary container: a hairline-bordered surface with an optional header row.
 * Used instead of a grid of cards so related data reads as one instrument.
 */
export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn("rounded-lg border bg-card text-card-foreground", className)}>
      {title || action ? (
        <header className="flex min-h-11 items-center justify-between gap-3 border-b px-4 py-2.5">
          <div className="min-w-0">
            {title ? <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2> : null}
            {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
          </div>
          {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </header>
      ) : null}
      <div className={cn(bodyClassName)}>{children}</div>
    </section>
  )
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  eyebrow?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        {eyebrow ? <div className="text-xs text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function PageContainer({ children, className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 py-5 md:px-6 md:py-6",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
