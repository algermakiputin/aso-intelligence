"use client"

import { ExternalLink, MoreHorizontal, Pause, Play, Star, StarOff, Trash2 } from "lucide-react"
import Link from "next/link"
import { useState, useTransition } from "react"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  type BulkResult,
  deleteKeywords,
  setKeywordsPriority,
  setKeywordsTracked,
} from "../actions"
import type { KeywordRow } from "../model"

export function KeywordRowMenu({ keyword, canEdit }: { keyword: KeywordRow; canEdit: boolean }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pending, startTransition] = useTransition()

  const run = (success: string, action: () => Promise<BulkResult>) =>
    startTransition(async () => {
      const result = await action()
      if (result.ok) toast.success(success)
      else toast.error(result.message)
    })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${keyword.keyword}`}
            disabled={pending}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/keywords/${keyword.id}`}>
              <ExternalLink />
              Open details
            </Link>
          </DropdownMenuItem>
          {canEdit ? (
            <>
              <DropdownMenuSeparator />
              {keyword.tracked ? (
                <DropdownMenuItem
                  onSelect={() =>
                    run("Tracking paused", () => setKeywordsTracked([keyword.id], false))
                  }
                >
                  <Pause />
                  Pause tracking
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onSelect={() =>
                    run("Tracking resumed", () => setKeywordsTracked([keyword.id], true))
                  }
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
                Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
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
              onClick={() => run("Keyword deleted", () => deleteKeywords([keyword.id]))}
            >
              Delete keyword
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
