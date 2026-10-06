"use client"

import { MoreHorizontal, Pause, Pencil, Play, Star, StarOff, Trash2 } from "lucide-react"
import { useActionState, useState, useTransition } from "react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { idleState } from "@/lib/validation/action-state"
import { CheckNowButton } from "../../rankings/components/refresh-rankings-button"
import {
  deleteKeywordAndReturn,
  setKeywordsPriority,
  setKeywordsTracked,
  updateKeywordAction,
} from "../actions"

interface KeywordActionsProps {
  keyword: {
    id: string
    keyword: string
    tracked: boolean
    isPriority: boolean
    relevance: number | null
    notes: string | null
  }
  canCheck: boolean
}

export function KeywordActions({ keyword, canCheck }: KeywordActionsProps) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pending, startTransition] = useTransition()

  const run = (success: string, action: () => Promise<{ ok: boolean; message?: string }>) =>
    startTransition(async () => {
      const result = await action()
      if (result.ok) toast.success(success)
      else toast.error(result.message ?? "Something went wrong")
    })

  return (
    <>
      <CheckNowButton keywordId={keyword.id} disabled={!canCheck} />
      <Button variant="outline" onClick={() => setEditing(true)}>
        <Pencil />
        Edit
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More actions" disabled={pending}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {keyword.tracked ? (
            <DropdownMenuItem
              onSelect={() => run("Tracking paused", () => setKeywordsTracked([keyword.id], false))}
            >
              <Pause />
              Pause tracking
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={() => run("Tracking resumed", () => setKeywordsTracked([keyword.id], true))}
            >
              <Play />
              Resume tracking
            </DropdownMenuItem>
          )}
          {keyword.isPriority ? (
            <DropdownMenuItem
              onSelect={() =>
                run("Priority removed", () => setKeywordsPriority([keyword.id], false))
              }
            >
              <StarOff />
              Remove priority
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={() =>
                run("Marked as priority", () => setKeywordsPriority([keyword.id], true))
              }
            >
              <Star />
              Mark priority
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            <Trash2 />
            Delete keyword
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditKeywordDialog keyword={keyword} open={editing} onOpenChange={setEditing} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{keyword.keyword}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its rank, popularity and difficulty history will be deleted too. Pause tracking
              instead to keep the history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => run("Keyword deleted", () => deleteKeywordAndReturn(keyword.id))}
            >
              Delete keyword
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function EditKeywordDialog({
  keyword,
  open,
  onOpenChange,
}: {
  keyword: KeywordActionsProps["keyword"]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: Awaited<ReturnType<typeof updateKeywordAction>>, formData: FormData) => {
      const result = await updateKeywordAction(prev, formData)
      if (result.status === "success") {
        toast.success(result.message ?? "Saved")
        onOpenChange(false)
      } else if (result.status === "error" && !result.fieldErrors) {
        toast.error(result.message)
      }
      return result
    },
    idleState,
  )
  const errors = state.status === "error" ? state.fieldErrors : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form action={formAction} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Edit “{keyword.keyword}”</DialogTitle>
            <DialogDescription>
              Relevance is your judgement of how well this term describes the app.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="id" value={keyword.id} />
          <FieldGroup className="gap-4">
            <Field data-invalid={Boolean(errors?.relevance)}>
              <FieldLabel htmlFor="edit-relevance">Relevance</FieldLabel>
              <Select
                name="relevance"
                defaultValue={keyword.relevance === null ? "unset" : String(keyword.relevance)}
              >
                <SelectTrigger id="edit-relevance">
                  <SelectValue placeholder="Not set" />
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
              <FieldError errors={errors?.relevance?.map((message) => ({ message }))} />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-notes">Notes</FieldLabel>
              <Textarea
                id="edit-notes"
                name="notes"
                rows={4}
                defaultValue={keyword.notes ?? ""}
                maxLength={2000}
              />
              <FieldDescription>
                Why this keyword matters, ideas, competitors to watch.
              </FieldDescription>
            </Field>
            <Field orientation="horizontal">
              <Checkbox id="edit-priority" name="isPriority" defaultChecked={keyword.isPriority} />
              <FieldLabel htmlFor="edit-priority" className="font-normal">
                Priority keyword
              </FieldLabel>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
