import type { z } from "zod"

/** Result shape returned by Server Actions used with `useActionState`. */
export type ActionState<T = undefined> =
  | { status: "idle" }
  | { status: "success"; message?: string; data?: T }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[] | undefined> }

export const idleState = { status: "idle" } as const

export function errorState(
  message: string,
  fieldErrors?: Record<string, string[] | undefined>,
): Extract<ActionState<never>, { status: "error" }> {
  return { status: "error", message, fieldErrors }
}

export function validationError(error: z.ZodError) {
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form"
    ;(fieldErrors[key] ??= []).push(issue.message)
  }
  return errorState("Check the highlighted fields.", fieldErrors)
}

/** Maps Postgres/PostgREST errors to messages that are safe to show. */
export function databaseErrorMessage(
  error: { code?: string; message?: string } | null,
  fallback: string,
): string {
  switch (error?.code) {
    case "23505":
      return "That already exists."
    case "42501":
      return "You don't have permission to do that."
    case "23514":
      return "Some values aren't valid."
    default:
      return fallback
  }
}
