import type { Column } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props<TData> {
  column: Column<TData, unknown>;
  children: React.ReactNode;
}

/** Naglowek kolumny, ktory klikniety przelacza sortowanie i pokazuje jego kierunek. */
export function SortableHeader<TData>({ column, children }: Props<TData>) {
  const sorted = column.getIsSorted();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 data-[state=open]:bg-accent"
      onClick={() => column.toggleSorting(sorted === 'asc')}
    >
      {children}
      {sorted === 'asc' ? (
        <ArrowUp />
      ) : sorted === 'desc' ? (
        <ArrowDown />
      ) : (
        <ChevronsUpDown className="opacity-50" />
      )}
    </Button>
  );
}
