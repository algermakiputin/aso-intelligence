import { MessageSquareText } from "lucide-react"
import type { Metadata } from "next"
import { ComingNext } from "@/components/dashboard/coming-next"

export const metadata: Metadata = { title: "Reviews" }

export default function ReviewsPage() {
  return (
    <ComingNext
      title="Reviews"
      description="What users say, and the words they use to describe your app."
      icon={MessageSquareText}
      version="V0.4"
      plans={[
        "Import App Store and Google Play reviews per storefront",
        "Extract recurring phrases and themes",
        "Discover keyword ideas from how users describe the app",
        "Track rating trends alongside releases",
      ]}
    />
  )
}
