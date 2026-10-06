"use client"

import { DownloadCloud, ExternalLink, Trash2 } from "lucide-react"
import { useActionState, useState, useTransition } from "react"
import { toast } from "sonner"
import { PlatformLabel } from "@/components/aso/metrics"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { getSourceInfo } from "@/lib/aso/sources"
import { formatCompact, formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { idleState } from "@/lib/validation/action-state"
import { countryName, languageName } from "@/lib/validation/locales"
import { deleteListingAction, syncListingAction, updateListingMetadataAction } from "../actions"
import { type Listing, storeUrlFor } from "../model"

const KEYWORD_FIELD_LIMIT = 100

export function ListingEditor({
  listing,
  canEdit,
  isDemo,
}: {
  listing: Listing
  canEdit: boolean
  isDemo: boolean
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: Awaited<ReturnType<typeof updateListingMetadataAction>>, formData: FormData) => {
      const result = await updateListingMetadataAction(prev, formData)
      if (result.status === "success") toast.success(result.message ?? "Saved")
      else if (result.status === "error" && !result.fieldErrors) toast.error(result.message)
      return result
    },
    idleState,
  )
  const [syncing, startSync] = useTransition()
  const [keywordField, setKeywordField] = useState(listing.keywordField ?? "")
  const errors = state.status === "error" ? state.fieldErrors : undefined
  const isIos = listing.platform === "ios"

  const sync = () =>
    startSync(async () => {
      const result = await syncListingAction(listing.id)
      if (result.status === "success") toast.success(result.message ?? "Imported")
      else if (result.status === "error") toast.error(result.message)
    })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <PlatformLabel platform={listing.platform} />
            <span className="text-sm font-medium">
              {countryName(listing.country)}, {languageName(listing.language)}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
            <span>
              {isIos ? "App Store ID" : "Package"}{" "}
              <span className="font-mono text-foreground">{listing.externalAppId}</span>
            </span>
            {isIos && listing.packageOrBundleId ? (
              <span>
                Bundle{" "}
                <span className="font-mono text-foreground">{listing.packageOrBundleId}</span>
              </span>
            ) : null}
            {listing.version ? <span>Version {listing.version}</span> : null}
            {listing.ratingCount !== null ? (
              <span>
                {listing.rating?.toFixed(1)} from {formatCompact(listing.ratingCount)}{" "}
                {listing.ratingCount === 1 ? "rating" : "ratings"}
              </span>
            ) : null}
            <span>
              Metadata source: {getSourceInfo(listing.metadataSource).label}
              {listing.lastSyncedAt
                ? `, last imported ${formatDateTime(listing.lastSyncedAt)}`
                : ""}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <a href={storeUrlFor(listing)} target="_blank" rel="noreferrer noopener">
              <ExternalLink />
              View in store
            </a>
          </Button>
          {canEdit && isIos && !isDemo ? (
            <Button variant="outline" size="sm" onClick={sync} disabled={syncing}>
              {syncing ? <Spinner /> : <DownloadCloud />}
              Sync from App Store
            </Button>
          ) : null}
          {canEdit ? <RemoveListingButton listing={listing} /> : null}
        </div>
      </div>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="listingId" value={listing.id} />
        <fieldset disabled={!canEdit || pending} className="contents">
          <FieldGroup className="gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field data-invalid={Boolean(errors?.title)}>
                <FieldLabel htmlFor={`title-${listing.id}`}>Title</FieldLabel>
                <Input
                  id={`title-${listing.id}`}
                  name="title"
                  defaultValue={listing.title ?? ""}
                  maxLength={255}
                />
                <FieldError errors={errors?.title?.map((message) => ({ message }))} />
              </Field>
              <Field>
                <FieldLabel htmlFor={`subtitle-${listing.id}`}>
                  {isIos ? "Subtitle" : "Short description"}
                </FieldLabel>
                <Input
                  id={`subtitle-${listing.id}`}
                  name="subtitle"
                  defaultValue={listing.subtitle ?? ""}
                  maxLength={255}
                />
                {isIos ? (
                  <FieldDescription>
                    Not available from the public API. Enter it from App Store Connect.
                  </FieldDescription>
                ) : null}
              </Field>
            </div>
            {isIos ? (
              <Field
                data-invalid={
                  Boolean(errors?.keywordField) || keywordField.length > KEYWORD_FIELD_LIMIT
                }
              >
                <div className="flex items-baseline justify-between">
                  <FieldLabel htmlFor={`keywords-${listing.id}`}>Keyword field</FieldLabel>
                  <span
                    className={cn(
                      "text-xs text-muted-foreground tabular",
                      keywordField.length > KEYWORD_FIELD_LIMIT && "text-destructive",
                    )}
                  >
                    {keywordField.length}/{KEYWORD_FIELD_LIMIT}
                  </span>
                </div>
                <Input
                  id={`keywords-${listing.id}`}
                  name="keywordField"
                  value={keywordField}
                  onChange={(e) => setKeywordField(e.target.value)}
                  placeholder="comma,separated,keywords"
                  className="font-mono text-xs"
                />
                <FieldDescription>
                  Private to App Store Connect. Used here only for coverage analysis.
                </FieldDescription>
                <FieldError errors={errors?.keywordField?.map((message) => ({ message }))} />
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor={`description-${listing.id}`}>
                {isIos ? "Description" : "Full description"}
              </FieldLabel>
              <Textarea
                id={`description-${listing.id}`}
                name="description"
                rows={5}
                defaultValue={listing.description ?? ""}
                className="max-h-72 overflow-y-auto"
              />
            </Field>
          </FieldGroup>
          {canEdit ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Field orientation="horizontal" className="w-auto">
                <Checkbox id={`record-${listing.id}`} name="recordEvents" defaultChecked />
                <FieldLabel htmlFor={`record-${listing.id}`} className="font-normal">
                  Record changed fields on the ASO timeline
                </FieldLabel>
              </Field>
              <Button type="submit" disabled={pending || keywordField.length > KEYWORD_FIELD_LIMIT}>
                {pending ? <Spinner /> : null}
                Save metadata
              </Button>
            </div>
          ) : null}
        </fieldset>
      </form>
      <p className="text-xs text-muted-foreground">
        This records what&apos;s live in the store so coverage analysis is accurate. It never
        publishes anything to App Store Connect or Google Play.
      </p>
    </div>
  )
}

function RemoveListingButton({ listing }: { listing: Listing }) {
  const [pending, startTransition] = useTransition()
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Remove listing" disabled={pending}>
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this listing?</AlertDialogTitle>
          <AlertDialogDescription>
            Its metadata history is deleted. Keywords stay, but they can&apos;t be rank-checked on
            this platform until a listing exists again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              startTransition(async () => {
                const result = await deleteListingAction(listing.id)
                if (result.status === "success") toast.success(result.message ?? "Removed")
                else if (result.status === "error") toast.error(result.message)
              })
            }
          >
            Remove listing
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
