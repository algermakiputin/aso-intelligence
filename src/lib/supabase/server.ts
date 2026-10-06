import "server-only"

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getSupabasePublicEnv } from "@/lib/env/public"
import type { Database } from "./database.types"
import type { AsoClient } from "./types"

/**
 * Per-request Supabase client acting as the signed-in user (RLS applies).
 * Use in Server Components, Server Actions and Route Handlers.
 */
export async function createSupabaseServerClient(): Promise<AsoClient> {
  const cookieStore = await cookies()
  const { url, anonKey } = getSupabasePublicEnv()

  return createServerClient<Database, "aso">(url, anonKey, {
    db: { schema: "aso" },
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options)
        } catch {
          // Called from a Server Component, where cookies are read-only. The proxy
          // refreshes the session on the next request, so this is safe to ignore.
        }
      },
    },
  })
}
