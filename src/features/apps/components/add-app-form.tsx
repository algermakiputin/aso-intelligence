"use client"

import { useActionState, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
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
} from "@/lib/validation/locales"
import { createAppAction } from "../actions"

function errorsFor(fieldErrors: Record<string, string[] | undefined> | undefined, key: string) {
  return fieldErrors?.[key]?.map((message) => ({ message }))
}

export function AddAppForm({ workspaces }: { workspaces: Array<{ id: string; name: string }> }) {
  const [state, formAction, pending] = useActionState(createAppAction, idleState)
  const [ios, setIos] = useState(true)
  const [android, setAndroid] = useState(false)
  const errors = state.status === "error" ? state.fieldErrors : undefined

  return (
    <form action={formAction} className="space-y-6">
      {state.status === "error" && !errors ? (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup className="gap-5">
        {workspaces.length > 1 ? (
          <Field>
            <FieldLabel htmlFor="workspaceId">Workspace</FieldLabel>
            <Select name="workspaceId" defaultValue={workspaces[0]?.id}>
              <SelectTrigger id="workspaceId">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <input type="hidden" name="workspaceId" value={workspaces[0]?.id ?? ""} />
        )}

        <Field data-invalid={Boolean(errors?.name)}>
          <FieldLabel htmlFor="name">App name</FieldLabel>
          <Input id="name" name="name" placeholder="Hunter Vault" required maxLength={80} />
          <FieldDescription>
            How the app appears in this tool. The store title is imported separately.
          </FieldDescription>
          <FieldError errors={errorsFor(errors, "name")} />
        </Field>

        <FieldSet>
          <FieldLegend variant="label">Platforms</FieldLegend>
          <div className="flex gap-6">
            <Field orientation="horizontal" className="w-auto">
              <Checkbox
                id="platform-ios"
                name="platforms"
                value="ios"
                checked={ios}
                onCheckedChange={(v) => setIos(v === true)}
              />
              <FieldLabel htmlFor="platform-ios" className="font-normal">
                iOS (App Store)
              </FieldLabel>
            </Field>
            <Field orientation="horizontal" className="w-auto">
              <Checkbox
                id="platform-android"
                name="platforms"
                value="android"
                checked={android}
                onCheckedChange={(v) => setAndroid(v === true)}
              />
              <FieldLabel htmlFor="platform-android" className="font-normal">
                Android (Google Play)
              </FieldLabel>
            </Field>
          </div>
          <FieldError errors={errorsFor(errors, "platforms")} />
        </FieldSet>

        {ios ? (
          <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors?.appStoreId)}>
              <FieldLabel htmlFor="appStoreId">App Store ID</FieldLabel>
              <Input
                id="appStoreId"
                name="appStoreId"
                placeholder="6761086056 or App Store URL"
                inputMode="url"
                className="font-mono"
              />
              <FieldError errors={errorsFor(errors, "appStoreId")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="bundleId">Bundle ID (optional)</FieldLabel>
              <Input
                id="bundleId"
                name="bundleId"
                placeholder="com.example.app"
                className="font-mono"
              />
            </Field>
            <Field orientation="horizontal" className="sm:col-span-2">
              <Checkbox id="importMetadata" name="importMetadata" defaultChecked />
              <FieldLabel htmlFor="importMetadata" className="font-normal">
                Import title, description and icon from the App Store
              </FieldLabel>
            </Field>
          </div>
        ) : null}

        {android ? (
          <div className="rounded-lg border p-4">
            <Field data-invalid={Boolean(errors?.playPackage)}>
              <FieldLabel htmlFor="playPackage">Google Play package name</FieldLabel>
              <Input
                id="playPackage"
                name="playPackage"
                placeholder="com.example.app or Play Store URL"
                className="font-mono"
              />
              <FieldDescription>
                Android rank tracking isn&apos;t available yet. Keywords and listings can still be
                set up.
              </FieldDescription>
              <FieldError errors={errorsFor(errors, "playPackage")} />
            </Field>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="defaultCountry">Default storefront</FieldLabel>
            <Select name="defaultCountry" defaultValue="US">
              <SelectTrigger id="defaultCountry">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STOREFRONT_COUNTRIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}: {countryName(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="defaultLanguage">Default language</FieldLabel>
            <Select name="defaultLanguage" defaultValue="en">
              <SelectTrigger id="defaultLanguage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l} value={l}>
                    {languageName(l)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <FieldDescription>
          New keywords default to this storefront. You can add other countries and languages later.
        </FieldDescription>
      </FieldGroup>

      <Button type="submit" size="lg" disabled={pending || (!ios && !android)}>
        {pending ? <Spinner /> : null}
        {pending ? "Adding app…" : "Add app"}
      </Button>
    </form>
  )
}
