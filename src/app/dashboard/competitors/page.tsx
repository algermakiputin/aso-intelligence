import { Swords } from "lucide-react"
import type { Metadata } from "next"
import { ComingNext } from "@/components/dashboard/coming-next"

export const metadata: Metadata = { title: "Competitors" }

export default function CompetitorsPage() {
  return (
    <ComingNext
      title="Competitors"
      description="See which apps you're up against and how their listings change."
      icon={Swords}
      version="V0.3"
      plans={[
        "Discover competitors from the apps ranking for your keywords",
        "Track competitor titles, subtitles, descriptions, ratings and versions",
        "Get notified when a competitor changes its metadata",
        "Compare keyword coverage side by side",
      ]}
    />
  )
}
