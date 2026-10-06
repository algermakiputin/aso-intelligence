"use client"

import { useActionState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { idleState } from "@/lib/validation/action-state"
import { createWorkspaceAction } from "../actions"

export function CreateWorkspaceForm() {
  const [state, formAction, pending] = useActionState(createWorkspaceAction, idleState)
  const errors = state.status === "error" ? state.fieldErrors : undefined
  return (
    <form action={formAction} className="space-y-6">
      {state.status === "error" && !errors ? (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <Field data-invalid={Boolean(errors?.name)}>
        <FieldLabel htmlFor="workspace-name">Workspace name</FieldLabel>
        <Input
          id="workspace-name"
          name="name"
          placeholder="Your studio or company"
          required
          maxLength={80}
          autoFocus
        />
        <FieldDescription>
          A workspace holds your apps and, later, your team. You&apos;ll be its owner.
        </FieldDescription>
        <FieldError errors={errors?.name?.map((message) => ({ message }))} />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Spinner /> : null}
        Create workspace
      </Button>
    </form>
  )
}
