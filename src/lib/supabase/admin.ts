import "server-only"

import { createClient } from "@supabase/supabase-js"
import { getSupabasePublicEnv } from "@/lib/env/public"
import { EnvError } from "@/lib/env/public"
import { getServerEnv } from "@/lib/env/server"
import type { Database } from "./database.types"
import type { AsoClient } from "./types"

/**
 * Service-role client. Bypasses RLS. Only for trusted server-side jobs (scheduled
 * collection) that act without a user session, never for user-initiated requests.
 */
export function createSupabaseAdminClient(): AsoClient {
  const { url } = getSupabasePublicEnv()
  const serviceRoleKey = getServerEnv().SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey)
    throw new EnvError("SUPABASE_SERVICE_ROLE_KEY is required for scheduled jobs")

  return createClient<Database, "aso">(url, serviceRoleKey, {
    db: { schema: "aso" },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
