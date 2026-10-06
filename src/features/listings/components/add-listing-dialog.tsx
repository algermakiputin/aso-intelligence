"use client"

import { Plus } from "lucide-react"
import { useActionState, useState } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
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
import { type Platform, PLATFORM_LABELS } from "@/types/aso"
import { addListingAction } from "../actions"

export function AddListingDialog({
  defaultCountry,
  defaultLanguage,
  knownIds,
}: {
  defaultCountry: string
  defaultLanguage: string
  /** Existing external ids per platform, pre-filled for new storefronts. */
  knownIds: Partial<Record<Platform, string>>
}) {
  const [open, setOpen] = useState(false)
  const [platform, setPlatform] = useState<Platform>("ios")
  const [state, formAction, pending] = useActionState(
    async (prev: Awaited<ReturnType<typeof addListingAction>>, formData: FormData) => {
      const result = await addListingAction(prev, formData)
      if (result.status === "success") {
        toast.success(result.message ?? "Added")
        setOpen(false)
      }
      return result
    },
    idleState,
  )
  const errors = state.status === "error" ? state.fieldErrors : undefined

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus />
          Add listing
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form action={formAction} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Add a store listing</DialogTitle>
            <DialogDescription>
              Add another platform, or another storefront country or language.
            </DialogDescription>
          </DialogHeader>
          {state.status === "error" && !errors ? (
            <Alert variant="destructive">
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="listing-platform">Platform</FieldLabel>
              <Select
                name="platform"
                value={platform}
                onValueChange={(v) => setPlatform(v as Platform)}
              >
                <SelectTrigger id="listing-platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["ios", "android"] as const).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PLATFORM_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field data-invalid={Boolean(errors?.externalId)}>
              <FieldLabel htmlFor="listing-external">
                {platform === "ios" ? "App Store ID" : "Package name"}
              </FieldLabel>
              <Input
                key={platform}
                id="listing-external"
                name="externalId"
                defaultValue={knownIds[platform] ?? ""}
                placeholder={
                  platform === "ios" ? "6761086056 or App Store URL" : "com.example.app or Play URL"
                }
                className="font-mono"
              />
              <FieldError errors={errors?.externalId?.map((message) => ({ message }))} />
            </Field>
            {platform === "ios" ? (
              <Field>
                <FieldLabel htmlFor="listing-bundle">Bundle ID (optional)</FieldLabel>
                <Input id="listing-bundle" name="bundleId" className="font-mono" />
              </Field>
            ) : (
              <input type="hidden" name="bundleId" value="" />
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="listing-country">Storefront</FieldLabel>
                <Select name="country" defaultValue={defaultCountry}>
                  <SelectTrigger id="listing-country">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {withValue(STOREFRONT_COUNTRIES, defaultCountry).map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}: {countryName(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="listing-language">Language</FieldLabel>
                <Select name="language" defaultValue={defaultLanguage}>
                  <SelectTrigger id="listing-language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {withValue(LANGUAGES, defaultLanguage).map((l) => (
                      <SelectItem key={l} value={l}>
                        {languageName(l)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null}
              Add listing
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
