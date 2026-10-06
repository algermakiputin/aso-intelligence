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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { idleState } from "@/lib/validation/action-state"
import { countryName, STOREFRONT_COUNTRIES, withValue } from "@/lib/validation/locales"
import { ASO_EVENT_TYPES, type AsoEventType, PLATFORM_LABELS, type Platform } from "@/types/aso"
import { createEventAction } from "../actions"
import { EVENT_DEFAULT_TITLES, EVENT_TYPE_LABELS, TEXT_CHANGE_TYPES } from "../model"

export function RecordEventDialog({
  platforms,
  defaultCountry,
  today,
  currentText,
}: {
  platforms: Platform[]
  defaultCountry: string
  today: string
  /** Current listing values, used to pre-fill "before" for text changes. */
  currentText: Partial<Record<AsoEventType, string | null>>
}) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<AsoEventType>("title_change")
  const [before, setBefore] = useState(currentText.title_change ?? "")
  const [state, formAction, pending] = useActionState(
    async (prev: Awaited<ReturnType<typeof createEventAction>>, formData: FormData) => {
      const result = await createEventAction(prev, formData)
      if (result.status === "success") {
        toast.success(result.message ?? "Recorded")
        setOpen(false)
      }
      return result
    },
    idleState,
  )
  const errors = state.status === "error" ? state.fieldErrors : undefined
  const isText = TEXT_CHANGE_TYPES.has(type)

  const changeType = (value: string) => {
    const next = value as AsoEventType
    setType(next)
    setBefore(currentText[next] ?? "")
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Record change
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form action={formAction} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Record an ASO change</DialogTitle>
            <DialogDescription>
              Log what changed in the listing and when. It shows on this timeline and as an
              annotation on rank charts. Nothing is published to the store.
            </DialogDescription>
          </DialogHeader>
          {state.status === "error" && !errors ? (
            <Alert variant="destructive">
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}
          <FieldGroup className="gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="event-type">What changed</FieldLabel>
                <Select name="type" value={type} onValueChange={changeType}>
                  <SelectTrigger id="event-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASO_EVENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {EVENT_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field data-invalid={Boolean(errors?.happenedOn)}>
                <FieldLabel htmlFor="event-date">Date</FieldLabel>
                <Input
                  id="event-date"
                  name="happenedOn"
                  type="date"
                  defaultValue={today}
                  max={today}
                  required
                />
                <FieldError errors={errors?.happenedOn?.map((message) => ({ message }))} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="event-platform">Platform</FieldLabel>
                <Select
                  name="platform"
                  defaultValue={platforms.length === 1 ? platforms[0] : "all"}
                >
                  <SelectTrigger id="event-platform">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All platforms</SelectItem>
                    {(["ios", "android"] as const).map((p) => (
                      <SelectItem key={p} value={p}>
                        {PLATFORM_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="event-country">Storefront</FieldLabel>
                <Select name="country" defaultValue={defaultCountry}>
                  <SelectTrigger id="event-country">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All storefronts</SelectItem>
                    {withValue(STOREFRONT_COUNTRIES, defaultCountry).map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}: {countryName(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="event-title">Title</FieldLabel>
              <Input
                id="event-title"
                name="title"
                placeholder={EVENT_DEFAULT_TITLES[type]}
                maxLength={200}
              />
            </Field>
            {isText ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="event-before">Before</FieldLabel>
                  <Textarea
                    id="event-before"
                    name="before"
                    rows={3}
                    value={before}
                    onChange={(e) => setBefore(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="event-after">After</FieldLabel>
                  <Textarea id="event-after" name="after" rows={3} />
                </Field>
              </div>
            ) : null}
            <Field>
              <FieldLabel htmlFor="event-description">Notes</FieldLabel>
              <Textarea
                id="event-description"
                name="description"
                rows={2}
                placeholder="Why the change was made, what you expect"
              />
              {isText ? (
                <FieldDescription>
                  Recording a change here doesn&apos;t update the stored listing. Edit the listing
                  in Settings to keep coverage analysis current.
                </FieldDescription>
              ) : null}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null}
              Record change
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
