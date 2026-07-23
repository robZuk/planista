import { useState, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, Search, Settings2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Props<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[] | undefined;
  isLoading?: boolean;
  /** Placeholder w polu wyszukiwania; brak = pole ukryte. */
  searchPlaceholder?: string;
  /** Co pokazac, gdy nie ma ani jednego wiersza (np. komponent <Empty>). */
  emptyState?: ReactNode;
  /** Dodatkowe kontrolki w pasku narzedzi (filtry, przycisk "Dodaj"). */
  toolbar?: ReactNode;
  /** Ile wierszy na stronie; 0 = bez paginacji (dla krotkich, kompletnych list). */
  pageSize?: number;
  /** Etykiety kolumn w menu widocznosci — bez tego menu pokazywaloby id kolumn. */
  columnLabels?: Record<string, string>;
}

/**
 * Jedna tabela na wszystkie listy w aplikacji.
 *
 * Buduje na TanStack Table (sortowanie, filtr globalny, paginacja, ukrywanie kolumn)
 * i renderuje to komponentami shadcn. Strony dostarczaja tylko definicje kolumn.
 */
export function DataTable<TData>({
  columns,
  data,
  isLoading = false,
  searchPlaceholder,
  emptyState,
  toolbar,
  pageSize = 10,
  columnLabels = {},
}: Props<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const table = useReactTable({
    data: data ?? [],
    columns,
    state: { sorting, globalFilter, columnVisibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(pageSize > 0
      ? {
          getPaginationRowModel: getPaginationRowModel(),
          initialState: { pagination: { pageSize } },
        }
      : {}),
  });

  const hideableColumns = table.getAllColumns().filter((column) => column.getCanHide());
  const rows = table.getRowModel().rows;

  // Pusty wynik wyszukiwania to co innego niz pusty zbior danych — komunikat musi sie roznic.
  const isEmptyData = !isLoading && (data?.length ?? 0) === 0;

  return (
    <div className="space-y-4">
      {(searchPlaceholder || toolbar || hideableColumns.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {searchPlaceholder && (
            <InputGroup className="w-full sm:max-w-xs">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                placeholder={searchPlaceholder}
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                aria-label={searchPlaceholder}
              />
            </InputGroup>
          )}

          <div className="ml-auto flex items-center gap-2">
            {toolbar}
            {hideableColumns.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Widoczne kolumny">
                    <Settings2 />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Widoczne kolumny</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {hideableColumns.map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                      // Zamkniecie menu po kazdym kliknieciu utrudnialoby ukrycie kilku kolumn.
                      onSelect={(e) => e.preventDefault()}
                    >
                      {columnLabels[column.id] ?? column.id}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      )}

      {isEmptyData && emptyState ? (
        emptyState
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} style={{ width: header.column.columnDef.size }}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                // Szkielet o tej samej liczbie kolumn — tabela nie "skacze" po zaladowaniu.
                Array.from({ length: 3 }).map((_, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {columns.map((_column, cellIndex) => (
                      <TableCell key={cellIndex}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                    Nic nie pasuje do wyszukiwania.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {pageSize > 0 && table.getPageCount() > 1 && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Strona {table.getState().pagination.pageIndex + 1} z {table.getPageCount()} ({rows.length} z{' '}
            {table.getFilteredRowModel().rows.length})
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft />
              Poprzednia
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Nastepna
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
