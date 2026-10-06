import { BrandWordmark } from "@/components/brand"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="px-6 py-5">
        <BrandWordmark />
      </header>
      <main className="flex flex-1 items-start justify-center px-6 pt-[12vh] pb-16">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  )
}
