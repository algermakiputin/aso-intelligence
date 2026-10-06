"use client"

import {
  createColumnHelper,
  createSortedRowModel,
  rowSelectionFeature,
  rowSortingFeature,
  type RowSelectionState,
  sortFn_alphanumeric,
  sortFn_basic,
  type SortingState,
  tableFeatures,
  useTable,
} from "@tanstack/react-table"
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Pause,
  Play,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react"
import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import {
  DifficultyValue,
  EstimatedRank,
  OpportunityValue,
  PlatformLabel,
  PopularityValue,
  RankChangeIndicator,
  RelativeTime,
  RelevanceValue,
} from "@/components/aso/metrics"
import { RankSparkline } from "@/components/charts/rank-sparkline"
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
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { comparePopularity } from "@/lib/aso/popularity"
import { compareRankValues, rankChangeSortValue } from "@/lib/aso/rank"
import { cn } from "@/lib/utils"
import { countryName } from "@/lib/validation/locales"
import { PLATFORM_LABELS, type Platform } from "@/types/aso"
import {
  type BulkResult,
  deleteKeywords,
  setKeywordsPriority,
  setKeywordsTracked,
} from "../actions"
import type { KeywordRow } from "../model"
import { measuredPopularity, opportunityMissingReasons } from "../model"
import {
  DEFAULT_FILTERS,
  filterKeywords,
  isFiltered,
  type KeywordFilterState,
  RANK_FILTER_LABELS,
  type RankFilter,
} from "./keyword-filters"
import { KeywordRowMenu } from "./keyword-row-menu"

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
  rowSelectionFeature,
})

const helper = createColumnHelper<typeof features, KeywordRow>()

interface TableMeta {
  now: string
  canEdit: boolean
  popularityConnected: boolean
}

function buildColumns(meta: TableMeta) {
  return helper.columns([
    ...(meta.canEdit
      ? [
          helper.display({
            id: "select",
            header: ({ table }) => (
              <Checkbox
                aria-label="Select all keywords"
                checked={
                  table.getIsAllRowsSelected()
                    ? true
                    : table.getIsSomeRowsSelected()
                      ? "indeterminate"
                      : false
                }
                onCheckedChange={(value) => table.toggleAllRowsSelected(value === true)}
              />
            ),
            cell: ({ row }) => (
              <Checkbox
                aria-label={`Select ${row.original.keyword}`}
                checked={row.getIsSelected()}
                onCheckedChange={(value) => row.toggleSelected(value === true)}
              />
            ),
          }),
        ]
      : []),
    helper.accessor("keyword", {
      header: "Keyword",
      sortFn: "alphanumeric",
      cell: ({ row }) => (
        <span className="flex min-w-0 items-center gap-1.5">
          {row.original.isPriority ? (
            <Star
              className="size-3 shrink-0 fill-current text-attention"
              aria-label="Priority keyword"
            />
          ) : null}
          <Link
            href={`/dashboard/keywords/${row.original.id}`}
            className="truncate font-medium hover:underline"
          >
            {row.original.keyword}
          </Link>
          {!row.original.tracked ? (
            <span className="shrink-0 rounded-sm border px-1 text-[10px] text-muted-foreground">
              Paused
            </span>
          ) : null}
        </span>
      ),
    }),
    helper.accessor("platform", {
      header: "Platform",
      sortFn: "alphanumeric",
      cell: ({ row }) => <PlatformLabel platform={row.original.platform} />,
    }),
    helper.accessor("country", {
      header: "Country",
      sortFn: "alphanumeric",
      cell: ({ row }) => (
        <span
          title={`${countryName(row.original.country)} (${row.original.language})`}
          className="tabular"
        >
          {row.original.country}
        </span>
      ),
    }),
    helper.accessor((row) => row.popularity ?? undefined, {
      id: "popularity",
      header: "Popularity",
      // Measured scores order by value; "not returned" sorts below every measured score
      // without being treated as 0; keywords with no popularity at all sort last.
      sortFn: (a, b) =>
        comparePopularity(measuredPopularity(a.original), measuredPopularity(b.original)),
      sortDescFirst: true,
      sortUndefined: "last",
      cell: ({ row }) => (
        <PopularityValue
          popularity={row.original.popularity}
          connected={meta.popularityConnected}
          now={meta.now}
        />
      ),
    }),
    helper.accessor((row) => row.latestRank?.value, {
      id: "rank",
      header: "Estimated Rank",
      sortFn: (a, b) =>
        compareRankValues(
          a.original.latestRank?.value ?? null,
          b.original.latestRank?.value ?? null,
        ),
      cell: ({ row }) => <EstimatedRank observation={row.original.latestRank} now={meta.now} />,
    }),
    helper.accessor(
      (row) => (row.change.kind === "no_baseline" ? undefined : rankChangeSortValue(row.change)),
      {
        id: "change",
        header: "Change",
        sortFn: "basic",
        sortDescFirst: true,
        sortUndefined: "last",
        cell: ({ row }) => <RankChangeIndicator change={row.original.change} />,
      },
    ),
    helper.accessor((row) => row.difficulty?.score, {
      id: "difficulty",
      header: "Difficulty",
      sortFn: "basic",
      sortUndefined: "last",
      cell: ({ row }) => <DifficultyValue difficulty={row.original.difficulty} />,
    }),
    helper.accessor((row) => row.relevance ?? undefined, {
      id: "relevance",
      header: "Relevance",
      sortFn: "basic",
      sortDescFirst: true,
      sortUndefined: "last",
      cell: ({ row }) => <RelevanceValue relevance={row.original.relevance} />,
    }),
    helper.accessor((row) => row.opportunity.score ?? undefined, {
      id: "opportunity",
      header: "Opportunity",
      sortFn: "basic",
      sortDescFirst: true,
      sortUndefined: "last",
      cell: ({ row }) => (
        <OpportunityValue
          opportunity={row.original.opportunity}
          missingReasons={opportunityMissingReasons(row.original, meta.popularityConnected)}
        />
      ),
    }),
    helper.display({
      id: "trend",
      header: "Trend",
      cell: ({ row }) => <RankSparkline points={row.original.recentRanks} />,
    }),
    helper.accessor(
      (row) => (row.latestRank ? new Date(row.latestRank.checkedAt).getTime() : undefined),
      {
        id: "checked",
        header: "Last checked",
        sortFn: "basic",
        sortDescFirst: true,
        sortUndefined: "last",
        cell: ({ row }) => (
          <RelativeTime
            value={row.original.latestRank?.checkedAt ?? null}
            now={meta.now}
            className="text-muted-foreground"
          />
        ),
      },
    ),
    helper.display({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => <KeywordRowMenu keyword={row.original} canEdit={meta.canEdit} />,
    }),
  ])
}

const NUMERIC_COLUMNS = new Set([
  "popularity",
  "rank",
  "change",
  "difficulty",
  "relevance",
  "opportunity",
  "checked",
])

export function KeywordsTable({
  keywords,
  now,
  canEdit,
  popularityConnected,
}: {
  keywords: KeywordRow[]
  now: string
  canEdit: boolean
  popularityConnected: boolean
}) {
  const [filters, setFilters] = useState<KeywordFilterState>(DEFAULT_FILTERS)
  const [sorting, setSorting] = useState<SortingState>([{ id: "opportunity", desc: true }])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pending, startTransition] = useTransition()

  const columns = useMemo(
    () => buildColumns({ now, canEdit, popularityConnected }),
    [now, canEdit, popularityConnected],
  )
  const data = useMemo(() => filterKeywords(keywords, filters), [keywords, filters])
  const countries = useMemo(() => [...new Set(keywords.map((k) => k.country))].sort(), [keywords])
  const platforms = useMemo(
    () => [...new Set(keywords.map((k) => k.platform))].sort() as Platform[],
    [keywords],
  )

  const table = useTable({
    features,
    columns,
    data,
    getRowId: (row) => row.id,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
  })

  const updateFilters = (patch: Partial<KeywordFilterState>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setRowSelection({})
  }

  const selectedIds = Object.keys(rowSelection).filter(
    (id) => rowSelection[id] && data.some((k) => k.id === id),
  )
  const rows = table.getRowModel().rows

  const runBulk = (label: string, action: () => Promise<BulkResult>) =>
    startTransition(async () => {
      const result = await action()
      if (result.ok) {
        toast.success(`${label}: ${result.count} ${result.count === 1 ? "keyword" : "keywords"}`)
        setRowSelection({})
      } else {
        toast.error(result.message)
      }
    })

  return (
    <div className="space-y-3">
      {/* Filters: one row above the data they scope. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => updateFilters({ search: e.target.value })}
            placeholder="Search keywords or notes"
            aria-label="Search keywords"
            className="pl-8"
          />
        </div>
        {platforms.length > 1 ? (
          <FilterSelect
            label="Platform"
            value={filters.platform}
            onChange={(v) => updateFilters({ platform: v as KeywordFilterState["platform"] })}
            options={[
              { value: "all", label: "All platforms" },
              ...platforms.map((p) => ({ value: p, label: PLATFORM_LABELS[p] })),
            ]}
          />
        ) : null}
        <FilterSelect
          label="Country"
          value={filters.country}
          onChange={(v) => updateFilters({ country: v })}
          options={[
            { value: "all", label: "All countries" },
            ...countries.map((c) => ({ value: c, label: `${c}: ${countryName(c)}` })),
          ]}
        />
        <FilterSelect
          label="Rank"
          value={filters.rank}
          onChange={(v) => updateFilters({ rank: v as RankFilter })}
          options={(Object.keys(RANK_FILTER_LABELS) as RankFilter[]).map((r) => ({
            value: r,
            label: RANK_FILTER_LABELS[r],
          }))}
        />
        <FilterSelect
          label="Tracking"
          value={filters.status}
          onChange={(v) => updateFilters({ status: v as KeywordFilterState["status"] })}
          options={[
            { value: "all", label: "Tracked and paused" },
            { value: "tracked", label: "Tracked" },
            { value: "paused", label: "Paused" },
          ]}
        />
        {isFiltered(filters) ? (
          <Button variant="ghost" size="sm" onClick={() => updateFilters(DEFAULT_FILTERS)}>
            <X />
            Clear
          </Button>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground tabular">
          {data.length === keywords.length
            ? `${keywords.length} keywords`
            : `${data.length} of ${keywords.length} keywords`}
        </span>
      </div>

      {canEdit && selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5 text-xs">
          <span className="font-medium tabular">{selectedIds.length} selected</span>
          <span className="mx-1 h-4 w-px bg-border" />
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => runBulk("Tracking resumed", () => setKeywordsTracked(selectedIds, true))}
          >
            <Play />
            Resume tracking
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => runBulk("Tracking paused", () => setKeywordsTracked(selectedIds, false))}
          >
            <Pause />
            Pause tracking
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              runBulk("Marked as priority", () => setKeywordsPriority(selectedIds, true))
            }
          >
            <Star />
            Mark priority
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              runBulk("Priority removed", () => setKeywordsPriority(selectedIds, false))
            }
          >
            Remove priority
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={pending}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 />
            Delete
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setRowSelection({})}>
            Clear selection
          </Button>
        </div>
      ) : null}

      {/* Desktop: dense table */}
      <div className="relative hidden overflow-x-auto rounded-lg border bg-card md:block">
        <table className="w-full min-w-[1080px] border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-card">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b">
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  const canSort = header.column.getCanSort()
                  const numeric = NUMERIC_COLUMNS.has(header.column.id)
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        sorted === "asc"
                          ? "ascending"
                          : sorted === "desc"
                            ? "descending"
                            : undefined
                      }
                      className={cn(
                        "h-9 px-3 text-left text-xs font-medium whitespace-nowrap text-muted-foreground",
                        header.column.id === "select" && "w-9 pr-0",
                        header.column.id === "actions" && "w-10",
                        numeric && "text-right",
                      )}
                    >
                      {canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            "inline-flex items-center gap-1 hover:text-foreground",
                            numeric && "flex-row-reverse",
                            sorted && "text-foreground",
                          )}
                        >
                          <table.FlexRender header={header} />
                          {sorted === "asc" ? (
                            <ArrowUp className="size-3" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="size-3" />
                          ) : (
                            <ChevronsUpDown className="size-3 opacity-40" />
                          )}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                data-state={row.getIsSelected() ? "selected" : undefined}
                className={cn(
                  "border-b last:border-b-0 hover:bg-muted/40 data-[state=selected]:bg-data-soft",
                  !row.original.tracked && "text-muted-foreground",
                )}
              >
                {row.getAllCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={cn(
                      "h-10 px-3 whitespace-nowrap",
                      cell.column.id === "select" && "w-9 pr-0",
                      cell.column.id === "keyword" && "max-w-[280px]",
                      NUMERIC_COLUMNS.has(cell.column.id) && "text-right",
                    )}
                  >
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <NoMatches onClear={() => updateFilters(DEFAULT_FILTERS)} /> : null}
      </div>

      {/* Mobile: compact list with the same sort and filters */}
      <ul className="divide-y rounded-lg border bg-card md:hidden">
        {rows.map((row) => {
          const k = row.original
          return (
            <li key={row.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/dashboard/keywords/${k.id}`}
                  className="block truncate text-sm font-medium"
                >
                  {k.isPriority ? (
                    <Star className="mr-1 inline size-3 fill-current align-[-1px] text-attention" />
                  ) : null}
                  {k.keyword}
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span>
                    {PLATFORM_LABELS[k.platform]} {k.country}
                  </span>
                  <span>
                    Opportunity{" "}
                    <OpportunityValue
                      opportunity={k.opportunity}
                      missingReasons={opportunityMissingReasons(k, popularityConnected)}
                      showBar={false}
                    />
                  </span>
                  {!k.tracked ? <span>Paused</span> : null}
                </div>
              </div>
              <div className="text-right text-sm">
                <EstimatedRank observation={k.latestRank} now={now} />
                <div className="text-xs">
                  <RankChangeIndicator change={k.change} />
                </div>
              </div>
              <KeywordRowMenu keyword={k} canEdit={canEdit} />
            </li>
          )
        })}
        {rows.length === 0 ? (
          <li>
            <NoMatches onClear={() => updateFilters(DEFAULT_FILTERS)} />
          </li>
        ) : null}
      </ul>

      <p className="text-xs text-muted-foreground">
        Estimated Rank comes from Apple&apos;s public iTunes Search API and approximates App Store
        search; it is not Apple&apos;s canonical rank. Popularity is Apple&apos;s relative score
        (1–100), not search volume. Difficulty is estimated from competing apps. Opportunity is this
        tool&apos;s own score.
      </p>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedIds.length} {selectedIds.length === 1 ? "keyword" : "keywords"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the keywords and their rank, popularity and difficulty
              history. To stop checking a keyword but keep its history, pause tracking instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => runBulk("Deleted", () => deleteKeywords(selectedIds))}
            >
              Delete keywords
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label={label} className="min-w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
      No keywords match these filters.
      <Button variant="outline" size="sm" onClick={onClear}>
        Clear filters
      </Button>
    </div>
  )
}
