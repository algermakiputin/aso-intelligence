import "server-only"

import { redirect } from "next/navigation"
import { cache } from "react"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export interface SessionUser {
  id: string
  email: string | null
}

/** Request-scoped Supabase client (one per request, as @supabase/ssr requires). */
export const getSupabase = cache(createSupabaseServerClient)

/** Verified user from the session JWT, or null. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await getSupabase()
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (error || !claims?.sub) return null
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null }
})

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  return user
}
