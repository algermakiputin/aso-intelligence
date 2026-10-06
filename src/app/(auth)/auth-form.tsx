"use client"

import Link from "next/link"
import { useActionState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { type ActionState, idleState } from "@/lib/validation/action-state"

interface AuthFormProps {
  mode: "login" | "signup"
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
  next?: string
  notice?: string
}

export function AuthForm({ mode, action, next, notice }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, idleState)
  const errors = state.status === "error" ? state.fieldErrors : undefined
  const isLogin = mode === "login"

  if (state.status === "success") {
    return (
      <div className="space-y-2">
        <h1 className="text-lg font-semibold tracking-tight">Check your inbox</h1>
        <p className="text-sm text-muted-foreground">{state.message}</p>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">
          {isLogin ? "Sign in" : "Create your account"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isLogin
            ? "Track keywords, estimated ranks and listing changes for your apps."
            : "You'll set up a workspace and add your first app next."}
        </p>
      </div>

      {notice ? (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      {state.status === "error" && !errors ? (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      {next ? <input type="hidden" name="next" value={next} /> : null}

      <FieldGroup className="gap-4">
        <Field data-invalid={Boolean(errors?.email)}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={Boolean(errors?.email)}
          />
          <FieldError errors={errors?.email?.map((message) => ({ message }))} />
        </Field>
        <Field data-invalid={Boolean(errors?.password)}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            minLength={8}
            required
            aria-invalid={Boolean(errors?.password)}
          />
          <FieldError errors={errors?.password?.map((message) => ({ message }))} />
        </Field>
      </FieldGroup>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null}
        {isLogin ? "Sign in" : "Create account"}
      </Button>

      <p className="text-sm text-muted-foreground">
        {isLogin ? "New here? " : "Already have an account? "}
        <Link
          href={isLogin ? "/signup" : "/login"}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {isLogin ? "Create an account" : "Sign in"}
        </Link>
      </p>
    </form>
  )
}
