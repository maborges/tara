"use client"

import * as React from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  X,
  FileSpreadsheet,
  FileText,
  SlidersHorizontal,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import * as XLSX from "xlsx"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

/* -------------------------------------------------------------------------- */
/* TYPES */
/* -------------------------------------------------------------------------- */

export type ColumnDef<T> = {
  id: string
  header: string
  accessorKey?: keyof T
  accessorFn?: (row: T) => any
  cell?: (value: any, row: T) => React.ReactNode
  sortable?: boolean
  filterable?: boolean
  filterPlaceholder?: string
  filterOptions?: { label: string; value: string }[]
  exportable?: boolean
  exportFormat?: (value: any, row: T) => string
  isActionColumn?: boolean
}

export type DataTableProps<T> = {
  data: T[]
  columns: ColumnDef<T>[]
  searchable?: boolean
  searchPlaceholder?: string
  exportable?: boolean
  exportFileName?: string
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string
  emptyMessage?: string
  className?: string
  isLoading?: boolean
}

type SortConfig<T> = {
  key: string
  direction: "asc" | "desc"
} | null

/* -------------------------------------------------------------------------- */
/* COMPONENT */
/* -------------------------------------------------------------------------- */

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  searchable = true,
  searchPlaceholder = "Buscar...",
  exportable = true,
  exportFileName = "export",
  onRowClick,
  rowClassName,
  emptyMessage = "Nenhum registro encontrado.",
  className,
  isLoading = false,
}: DataTableProps<T>) {
  const [sortConfig, setSortConfig] = React.useState<SortConfig<T>>(null)
  const [filters, setFilters] = React.useState<Record<string, string>>({})
  const [globalFilter, setGlobalFilter] = React.useState("")
  const [showFilters, setShowFilters] = React.useState(false)
  const [pageSize, setPageSize] = React.useState(30)
  const [currentPage, setCurrentPage] = React.useState(1)

  const hasActiveFilters =
    Object.values(filters).some(Boolean) || !!globalFilter

  /* ---------------- CELL VALUE ---------------- */

  const getCellValue = React.useCallback((row: T, column: ColumnDef<T>): any => {
    if (column.accessorFn) return column.accessorFn(row)
    if (column.accessorKey) return row[column.accessorKey]
    return null
  }, [])

  const renderCell = React.useCallback(
    (row: T, column: ColumnDef<T>) => {
      const value = getCellValue(row, column)
      return column.cell ? column.cell(value, row) : value?.toString() || "-"
    },
    [getCellValue]
  )

  /* ---------------- SORT ---------------- */

  const sortedData = React.useMemo(() => {
    let sortableData = Array.isArray(data) ? [...data] : []

    if (!sortConfig) return sortableData

    sortableData.sort((a, b) => {
      const column = columns.find((c) => c.id === sortConfig.key)
      if (!column) return 0

      const aValue = getCellValue(a, column)
      const bValue = getCellValue(b, column)

      if (aValue == null) return 1
      if (bValue == null) return -1

      if (aValue < bValue)
        return sortConfig.direction === "asc" ? -1 : 1
      if (aValue > bValue)
        return sortConfig.direction === "asc" ? 1 : -1
      return 0
    })

    return sortableData
  }, [data, sortConfig, columns, getCellValue])

  /* ---------------- FILTER ---------------- */

  const filteredData = React.useMemo(() => {
    return sortedData.filter((row) => {
      const columnMatch = Object.entries(filters).every(
        ([columnId, filterValue]) => {
          if (!filterValue) return true
          const column = columns.find((c) => c.id === columnId)
          if (!column) return true

          const cell = getCellValue(row, column)
          if (column.filterOptions) {
            return cell?.toString() === filterValue
          }
          return (
            cell?.toString().toLowerCase().includes(filterValue.toLowerCase())
          )
        }
      )

      if (!columnMatch) return false

      if (globalFilter) {
        return columns.some((column) => {
          const cell = getCellValue(row, column)
          return (
            cell?.toString().toLowerCase().includes(globalFilter.toLowerCase())
          )
        })
      }

      return true
    })
  }, [sortedData, filters, globalFilter, columns, getCellValue])

  /* ---------------- PAGINATION ---------------- */

  const totalPages = Math.ceil(filteredData.length / pageSize)
  const normalizedCurrentPage = Math.max(1, Math.min(currentPage, Math.max(totalPages, 1)))
  const paginatedData = React.useMemo(() => {
    const start = (normalizedCurrentPage - 1) * pageSize
    return filteredData.slice(start, start + pageSize)
  }, [filteredData, normalizedCurrentPage, pageSize])

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }

  const visiblePages = React.useMemo(() => {
    const pages: (number | "...")[] = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      if (normalizedCurrentPage > 3) pages.push("...")
      const start = Math.max(2, normalizedCurrentPage - 1)
      const end = Math.min(totalPages - 1, normalizedCurrentPage + 1)
      for (let i = start; i <= end; i++) pages.push(i)
      if (normalizedCurrentPage < totalPages - 2) pages.push("...")
      pages.push(totalPages)
    }
    return pages
  }, [normalizedCurrentPage, totalPages])

  /* ---------------- ACTIONS ---------------- */

  const handleSort = (columnId: string) => {
    setSortConfig((current) => {
      if (!current || current.key !== columnId)
        return { key: columnId, direction: "asc" }
      if (current.direction === "asc")
        return { key: columnId, direction: "desc" }
      return null
    })
  }

  const handleFilterChange = (columnId: string, value: string) => {
    setFilters((prev) => ({ ...prev, [columnId]: value }))
  }

  const clearFilter = (columnId: string) => {
    setFilters((prev) => {
      const copy = { ...prev }
      delete copy[columnId]
      return copy
    })
  }

  /* ---------------- EXPORT ---------------- */

  const exportColumns = columns.filter((c) => c.exportable !== false)

  const exportToExcel = () => {
    const exportData = filteredData.map((row) => {
      const rowData: Record<string, any> = {}
      exportColumns.forEach((column) => {
        const value = getCellValue(row, column)
        rowData[column.header] = column.exportFormat
          ? column.exportFormat(value, row)
          : value
      })
      return rowData
    })

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Data")
    XLSX.writeFile(wb, `${exportFileName}.xlsx`)
  }

  const exportToPDF = () => {
    const doc = new jsPDF()

    autoTable(doc, {
      head: [exportColumns.map((c) => c.header)],
      body: filteredData.map((row) =>
        exportColumns.map((column) => {
          const value = getCellValue(row, column)
          return column.exportFormat
            ? column.exportFormat(value, row)
            : value?.toString() || ""
        })
      ),
      styles: { fontSize: 8 },
    })

    doc.save(`${exportFileName}.pdf`)
  }

  /* -------------------------------------------------------------------------- */
  /* RENDER */
  /* -------------------------------------------------------------------------- */

  return (
    <Card className={cn("w-full overflow-hidden flex flex-col", className)}>
      <CardContent className="flex flex-col flex-1 min-h-0 gap-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between shrink-0">
          {searchable && (
            <div className="relative w-full lg:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder={searchPlaceholder}
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="pl-9"
              />
              {globalFilter && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 size-6"
                  onClick={() => setGlobalFilter("")}
                  aria-label="Limpar busca"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant={showFilters || hasActiveFilters ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFilters((v) => !v)}
            >
              <SlidersHorizontal className="size-4 mr-2" />
              + Filtros
            </Button>

            {exportable && (
              <>
                <Button size="sm" variant="outline" onClick={exportToExcel}>
                  <FileSpreadsheet className="size-4 mr-2" />
                  Excel
                </Button>

                <Button size="sm" variant="outline" onClick={exportToPDF}>
                  <FileText className="size-4 mr-2" />
                  PDF
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="rounded-sm border flex-1 min-h-0 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                {columns.map((column) => {
                  const isActionColumn = column.isActionColumn || column.id === "actions" || column.id === "acoes" || (column.sortable === false && column.filterable === false && column.exportable === false)
                  return (
                    <TableHead key={column.id} className={cn("compact", isActionColumn ? "w-[1%] whitespace-nowrap" : "")}>
                      {isActionColumn ? null : column.sortable !== false ? (
                        <button
                          onClick={() => handleSort(column.id)}
                          className="flex items-center gap-1 font-medium"
                        >
                          {column.header}
                          {sortConfig?.key === column.id ? (
                            sortConfig?.direction === "asc" ? (
                              <ArrowUp className="size-4" />
                            ) : (
                              <ArrowDown className="size-4" />
                            )
                          ) : (
                            <ArrowUpDown className="size-4 opacity-40" />
                          )}
                        </button>
                      ) : (
                        column.header
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>

              {showFilters && (
                <TableRow className="hover:bg-transparent animate-in fade-in-50">
                  {columns.map((column) => {
                    const isActionColumn = column.isActionColumn || column.id === "actions" || column.id === "acoes" || (column.sortable === false && column.filterable === false && column.exportable === false)
                    return (
                      <TableHead key={`filter-${column.id}`} className="compact">
                        {!isActionColumn && column.filterable !== false && (
                          <div className="relative group">
                            {column.filterOptions ? (
                              <Select
                                value={filters[column.id] || "all"}
                                onValueChange={(val: string) => {
                                  if (val === "all") clearFilter(column.id)
                                  else handleFilterChange(column.id, val)
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs rounded-sm bg-background/50 border-muted-foreground/20">
                                  <SelectValue placeholder={column.header} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">Todos</SelectItem>
                                  {column.filterOptions.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <>
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 transition-colors group-focus-within:text-primary/70" />
                                <Input
                                  type="search"
                                  placeholder={column.filterPlaceholder || "Filtrar..."}
                                  value={filters[column.id] || ""}
                                  onChange={(e) => handleFilterChange(column.id, e.target.value)}
                                  className="h-8 text-xs rounded-sm font-normal pl-7 shadow-xs font-mono placeholder:font-sans"
                                />
                                {filters[column.id] && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-1 top-1/2 -translate-y-1/2 size-6 hover:bg-muted"
                                    onClick={() => clearFilter(column.id)}
                                    aria-label={`Limpar filtro de ${column.header || column.id}`}
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </TableHead>
                    )
                  })}
                </TableRow>
              )}
            </TableHeader>

            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <span className="text-xs text-muted-foreground">Carregando dados...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginatedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedData.map((row, index) => (
                  <TableRow
                    key={index}
                    onClick={() => onRowClick?.(row)}
                    className={cn("compact text-sm", onRowClick && "cursor-pointer", rowClassName?.(row))}
                  >
                    {columns.map((column) => {
                      const isActionColumn = column.isActionColumn || column.id === "actions" || column.id === "acoes" || (column.sortable === false && column.filterable === false && column.exportable === false)
                      return (
                        <TableCell key={column.id} className={cn("!px-2 !py-1.5", isActionColumn ? "whitespace-nowrap w-px" : "")}>
                          {renderCell(row, column)}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col gap-3 px-1 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Exibindo</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setCurrentPage(1)
              }}
              className="h-8 rounded-sm border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value={10}>10</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>de {filteredData.length} registro(s)</span>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(1)}
                disabled={normalizedCurrentPage === 1}
              >
                Primeira
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(normalizedCurrentPage - 1)}
                disabled={normalizedCurrentPage === 1}
              >
                Anterior
              </Button>

              <div className="flex items-center gap-1">
                {visiblePages.map((page, idx) =>
                  page === "..." ? (
                    <span key={`ellipsis-${idx}`} className="px-1 text-muted-foreground">
                      ...
                    </span>
                  ) : (
                    <Button
                      key={page}
                      variant={normalizedCurrentPage === page ? "default" : "outline"}
                      size="sm"
                      onClick={() => goToPage(page)}
                      className={cn(
                        "min-w-8",
                        normalizedCurrentPage === page && "bg-primary text-primary-foreground"
                      )}
                    >
                      {page}
                    </Button>
                  )
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Próxima
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(totalPages)}
                disabled={currentPage === totalPages}
              >
                Última
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
