"use client"

import { useActionState, useRef } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { idleState } from "@/lib/validation/action-state"
import { recordManualPopularityAction } from "../actions"

/** Record a popularity value read elsewhere (e.g. Apple Ads). Stored with source = manual. */
export function ManualPopularityForm({ keywordId, today }: { keywordId: string; today: string }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction, pending] = useActionState(
    async (prev: Awaited<ReturnType<typeof recordManualPopularityAction>>, formData: FormData) => {
      const result = await recordManualPopularityAction(prev, formData)
      if (result.status === "success") {
        toast.success(result.message ?? "Recorded")
        formRef.current?.reset()
      } else if (result.status === "error" && !result.fieldErrors) {
        toast.error(result.message)
      }
      return result
    },
    idleState,
  )
  const errors = state.status === "error" ? state.fieldErrors : undefined

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="keywordId" value={keywordId} />
      <Field className="w-24" data-invalid={Boolean(errors?.score)}>
        <FieldLabel htmlFor="pop-score" className="text-xs">
          Popularity
        </FieldLabel>
        <Input
          id="pop-score"
          name="score"
          type="number"
          min={1}
          max={100}
          step={1}
          placeholder="1–100"
          required
        />
      </Field>
      <Field className="w-40" data-invalid={Boolean(errors?.measuredOn)}>
        <FieldLabel htmlFor="pop-date" className="text-xs">
          Observed on
        </FieldLabel>
        <Input
          id="pop-date"
          name="measuredOn"
          type="date"
          defaultValue={today}
          max={today}
          required
        />
      </Field>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? <Spinner /> : null}
        Record
      </Button>
      <FieldError
        className="basis-full"
        errors={[...(errors?.score ?? []), ...(errors?.measuredOn ?? [])].map((message) => ({
          message,
        }))}
      />
    </form>
  )
}
