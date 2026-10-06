/**
 * Public (browser-safe) environment. NEXT_PUBLIC_* values are inlined at build time, so
 * they must be read with literal `process.env.NAME` access.
 */

import { z } from "zod"

export class EnvError extends Error {
  override name = "EnvError"
}

const publicSchema = z.object({
  url: z.url({ message: "NEXT_PUBLIC_SUPABASE_URL must be a URL" }),
  anonKey: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
})

export type SupabasePublicEnv = z.infer<typeof publicSchema>

let cached: SupabasePublicEnv | null = null

export function getSupabasePublicEnv(): SupabasePublicEnv {
  if (cached) return cached
  const parsed = publicSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  })
  if (!parsed.success) {
    throw new EnvError(
      `Supabase is not configured: ${parsed.error.issues.map((i) => i.message).join("; ")}. ` +
        "Copy .env.example to .env.local and fill in the values from `npx supabase status`.",
    )
  }
  cached = parsed.data
  return cached
}
