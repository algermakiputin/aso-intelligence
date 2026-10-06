import { SearchX } from "lucide-react"
import Link from "next/link"
import { EmptyState } from "@/components/dashboard/empty-state"
import { PageContainer } from "@/components/dashboard/panel"
import { Button } from "@/components/ui/button"

export default function KeywordNotFound() {
  return (
    <PageContainer>
      <div className="rounded-lg border bg-card">
        <EmptyState
          icon={SearchX}
          title="Keyword not found"
          description="It may have been deleted, or it belongs to a different app. Switch apps from the sidebar if you expected to see it."
        >
          <Button asChild variant="outline">
            <Link href="/dashboard/keywords">Back to keywords</Link>
          </Button>
        </EmptyState>
      </div>
    </PageContainer>
  )
}
