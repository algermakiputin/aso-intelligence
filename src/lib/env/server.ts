/**
 * Server-only environment. Importing this from a Client Component fails the build
 * (`server-only`), which keeps service-role and store credentials out of browser bundles.
 */

import "server-only"

import { z } from "zod"
import { EnvError } from "./public"

const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value

const optionalString = z.preprocess(blankToUndefined, z.string().optional())

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  CRON_SECRET: z.preprocess(
    blankToUndefined,
    z.string().min(16, "CRON_SECRET must be at least 16 characters").optional(),
  ),
  APPLE_ADS_CLIENT_ID: optionalString,
  APPLE_ADS_TEAM_ID: optionalString,
  APPLE_ADS_KEY_ID: optionalString,
  APPLE_ADS_PRIVATE_KEY: optionalString,
  APPLE_ADS_CLIENT_SECRET: optionalString,
  APPLE_ADS_ACCOUNT_ID: optionalString,
})

export type ServerEnv = z.infer<typeof serverSchema>

let cached: ServerEnv | null = null

export function getServerEnv(): ServerEnv {
  if (cached) return cached
  const parsed = serverSchema.safeParse(process.env)
  if (!parsed.success) {
    throw new EnvError(
      `Invalid server environment: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    )
  }
  cached = parsed.data
  return cached
}
