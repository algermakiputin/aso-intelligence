"use client"

import { Plus } from "lucide-react"
import { useActionState, useState } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { parseKeywordList } from "@/lib/aso/normalization/text"
import { idleState } from "@/lib/validation/action-state"
import {
  countryName,
  languageName,
  LANGUAGES,
  STOREFRONT_COUNTRIES,
  withValue,
} from "@/lib/validation/locales"
import { PLATFORM_LABELS, PLATFORMS, type Platform } from "@/types/aso"
import { addKeywordsAction, type AddKeywordsResult } from "../actions"

export function AddKeywordsDialog({
  platforms,
  defaultCountry,
  defaultLanguage,
  trigger,
}: {
  platforms: Platform[]
  defaultCountry: string
  defaultLanguage: string
  trigger?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [state, formAction, pending] = useActionState<AddKeywordsResult, FormData>(
    async (prev, formData) => {
      const result = await addKeywordsAction(prev, formData)
      if (result.status === "success" && result.data) {
        const { existing } = result.data
        toast.success(result.message, {
          description:
            existing.length > 0
              ? `${existing.length} already tracked: ${existing.slice(0, 5).join(", ")}${existing.length > 5 ? "…" : ""}`
              : undefined,
        })
        setOpen(false)
        setText("")
      }
      return result
    },
    idleState,
  )
  const available = platforms.length > 0 ? platforms : [...PLATFORMS]
  const parsedCount = parseKeywordList(text).keywords.length
  const errors = state.status === "error" ? state.fieldErrors : undefined

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus />
            Add keywords
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form action={formAction} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Add keywords</DialogTitle>
            <DialogDescription>
              One per line, or separated by commas. Keywords are tracked per platform and
              storefront.
            </DialogDescription>
          </DialogHeader>

          {state.status === "error" && !errors ? (
            <Alert variant="destructive">
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}

          <FieldGroup className="gap-4">
            <Field data-invalid={Boolean(errors?.keywords)}>
              <FieldLabel htmlFor="keywords">Keywords</FieldLabel>
              <Textarea
                id="keywords"
                name="keywords"
                rows={6}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={"budget game\ngamified budget\nexpense tracker"}
                autoFocus
              />
              <FieldDescription className="tabular">
                {parsedCount === 0
                  ? "Duplicates and extra spaces are removed automatically."
                  : `${parsedCount} unique ${parsedCount === 1 ? "keyword" : "keywords"}`}
              </FieldDescription>
              <FieldError errors={errors?.keywords?.map((message) => ({ message }))} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="platform">Platform</FieldLabel>
                <Select name="platform" defaultValue={available[0]}>
                  <SelectTrigger id="platform">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PLATFORM_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="country">Country</FieldLabel>
                <Select name="country" defaultValue={defaultCountry}>
                  <SelectTrigger id="country">
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
                <FieldLabel htmlFor="language">Language</FieldLabel>
                <Select name="language" defaultValue={defaultLanguage}>
                  <SelectTrigger id="language">
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

            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="relevance">Relevance</FieldLabel>
                <Select name="relevance" defaultValue="unset">
                  <SelectTrigger id="relevance">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">Not set</SelectItem>
                    {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}/10
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field orientation="horizontal" className="self-end pb-1.5 sm:col-span-2">
                <Checkbox id="isPriority" name="isPriority" />
                <FieldLabel htmlFor="isPriority" className="font-normal">
                  Priority (checked about daily by scheduled jobs)
                </FieldLabel>
              </Field>
            </div>
            <FieldDescription>
              Relevance is your judgement of how well the term describes the app. It drives the
              Opportunity Score.
            </FieldDescription>
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || parsedCount === 0}>
              {pending ? <Spinner /> : null}
              Add {parsedCount > 0 ? parsedCount : ""} {parsedCount === 1 ? "keyword" : "keywords"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
