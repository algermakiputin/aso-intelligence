import type { LucideIcon } from "lucide-react"
import { Panel, PageContainer, PageHeader } from "./panel"

/** Honest placeholder for sections that aren't built yet. No fake data, no fake controls. */
export function ComingNext({
  title,
  description,
  icon: Icon,
  version,
  plans,
}: {
  title: string
  description: string
  icon: LucideIcon
  version: string
  plans: string[]
}) {
  return (
    <PageContainer>
      <PageHeader title={title} description={description} />
      <Panel>
        <div className="grid gap-8 p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:p-8">
          <div className="space-y-3">
            <div className="flex size-9 items-center justify-center rounded-md border bg-muted/40">
              <Icon className="size-4 text-muted-foreground" />
            </div>
            <h2 className="text-base font-semibold tracking-tight">Coming in {version}</h2>
            <p className="text-sm text-muted-foreground">
              This section is part of the roadmap. It will appear here once the data behind it is
              real. Until then, nothing on this page is simulated.
            </p>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">Planned</h3>
            <ul className="divide-y rounded-md border text-sm">
              {plans.map((plan) => (
                <li key={plan} className="px-3 py-2.5">
                  {plan}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>
    </PageContainer>
  )
}
