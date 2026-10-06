import { BarChart3 } from "lucide-react"
import type { Metadata } from "next"
import { ComingNext } from "@/components/dashboard/coming-next"

export const metadata: Metadata = { title: "Analytics" }

export default function AnalyticsPage() {
  return (
    <ComingNext
      title="Analytics"
      description="Store performance from App Store Connect and Google Play, next to your ASO changes."
      icon={BarChart3}
      version="V0.2"
      plans={[
        "App Store Connect Analytics: impressions, product page views, downloads",
        "Google Play Console performance reports",
        "Search vs. browse acquisition",
        "Conversion rate over time, annotated with ASO changes",
      ]}
    />
  )
}
