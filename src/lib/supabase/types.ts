import type { SupabaseClient } from "@supabase/supabase-js"
import type { AsoEventType, DataConfidence, Platform, WorkspaceRole } from "@/types/aso"
import type { Database } from "./database.types"

/** Supabase client bound to the `aso` schema. */
export type AsoClient = SupabaseClient<Database, "aso">

type Schema = Database["aso"]
export type TableRow<T extends keyof Schema["Tables"]> = Schema["Tables"][T]["Row"]
export type TableInsert<T extends keyof Schema["Tables"]> = Schema["Tables"][T]["Insert"]
export type TableUpdate<T extends keyof Schema["Tables"]> = Schema["Tables"][T]["Update"]
export type ViewRow<T extends keyof Schema["Views"]> = Schema["Views"][T]["Row"]

// Compile-time guard: domain enums must match the database enums exactly.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Assert<T extends true> = T
export type _EnumsInSync = [
  Assert<Same<Schema["Enums"]["platform"], Platform>>,
  Assert<Same<Schema["Enums"]["workspace_role"], WorkspaceRole>>,
  Assert<Same<Schema["Enums"]["data_confidence"], DataConfidence>>,
  Assert<Same<Schema["Enums"]["aso_event_type"], AsoEventType>>,
]
