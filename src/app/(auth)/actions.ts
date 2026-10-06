"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { z } from "zod"
import { getSupabase } from "@/lib/auth/session"
import { type ActionState, errorState, validationError } from "@/lib/validation/action-state"
import { formString } from "@/lib/validation/common"

const credentialsSchema = z.object({
  email: z.email({ message: "Enter a valid email address" }),
  password: z.string().min(8, "Use at least 8 characters"),
})

/** Only same-origin relative paths are allowed as post-login destinations. */
function safeNext(value: string): string | null {
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : null
}

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formString(formData, "email"),
    password: formString(formData, "password"),
  })
  if (!parsed.success) return validationError(parsed.error)

  const supabase = await getSupabase()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) {
    return errorState(
      error.code === "email_not_confirmed"
        ? "Confirm your email address first. Check your inbox for the link."
        : "Email or password is incorrect.",
    )
  }

  redirect(safeNext(formString(formData, "next")) ?? "/dashboard")
}

export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formString(formData, "email"),
    password: formString(formData, "password"),
  })
  if (!parsed.success) return validationError(parsed.error)

  const origin = (await headers()).get("origin") ?? ""
  const supabase = await getSupabase()
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${origin}/auth/callback?next=/onboarding` },
  })
  if (error) return errorState(error.message)
  if (!data.session) {
    return {
      status: "success",
      message: "Check your email for a confirmation link to finish signing up.",
    }
  }

  redirect("/onboarding")
}

export async function signOut(): Promise<void> {
  const supabase = await getSupabase()
  await supabase.auth.signOut()
  redirect("/login")
}
