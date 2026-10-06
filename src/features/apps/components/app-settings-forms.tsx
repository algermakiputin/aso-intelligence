"use client"

import { useActionState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { idleState } from "@/lib/validation/action-state"
import {
  countryName,
  languageName,
  LANGUAGES,
  STOREFRONT_COUNTRIES,
  withValue,
} from "@/lib/validation/locales"
import { deleteAppAction, updateAppAction } from "../actions"

export function AppDetailsForm({
  app,
  canEdit,
}: {
  app: { name: string; defaultCountry: string; defaultLanguage: string }
  canEdit: boolean
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: Awaited<ReturnType<typeof updateAppAction>>, formData: FormData) => {
      const result = await updateAppAction(prev, formData)
      if (result.status === "success") toast.success(result.message ?? "Saved")
      else if (result.status === "error" && !result.fieldErrors) toast.error(result.message)
      return result
    },
    idleState,
  )
  const errors = state.status === "error" ? state.fieldErrors : undefined

  return (
    <form action={formAction}>
      <fieldset
        disabled={!canEdit || pending}
        className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"
      >
        <Field data-invalid={Boolean(errors?.name)}>
          <FieldLabel htmlFor="app-name">App name</FieldLabel>
          <Input id="app-name" name="name" defaultValue={app.name} maxLength={80} required />
          <FieldError errors={errors?.name?.map((message) => ({ message }))} />
        </Field>
        <Field>
          <FieldLabel htmlFor="app-country">Default storefront</FieldLabel>
          <Select name="defaultCountry" defaultValue={app.defaultCountry}>
            <SelectTrigger id="app-country">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {withValue(STOREFRONT_COUNTRIES, app.defaultCountry).map((c) => (
                <SelectItem key={c} value={c}>
                  {c}: {countryName(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="app-language">Default language</FieldLabel>
          <Select name="defaultLanguage" defaultValue={app.defaultLanguage}>
            <SelectTrigger id="app-language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {withValue(LANGUAGES, app.defaultLanguage).map((l) => (
                <SelectItem key={l} value={l}>
                  {languageName(l)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {canEdit ? (
          <Button type="submit" disabled={pending}>
            {pending ? <Spinner /> : null}
            Save
          </Button>
        ) : null}
      </fieldset>
    </form>
  )
}

export function DeleteAppForm({ appName }: { appName: string }) {
  const [state, formAction, pending] = useActionState(
    async (prev: Awaited<ReturnType<typeof deleteAppAction>>, formData: FormData) => {
      const result = await deleteAppAction(prev, formData)
      if (result.status === "error" && !result.fieldErrors) toast.error(result.message)
      return result
    },
    idleState,
  )
  const errors = state.status === "error" ? state.fieldErrors : undefined
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <Field className="w-64" data-invalid={Boolean(errors?.confirm)}>
        <FieldLabel htmlFor="confirm-delete" className="font-normal text-muted-foreground">
          Type <span className="font-medium text-foreground">{appName}</span> to confirm
        </FieldLabel>
        <Input id="confirm-delete" name="confirm" autoComplete="off" />
        <FieldError errors={errors?.confirm?.map((message) => ({ message }))} />
      </Field>
      <Button type="submit" variant="destructive" disabled={pending}>
        {pending ? <Spinner /> : null}
        Delete app
      </Button>
    </form>
  )
}
