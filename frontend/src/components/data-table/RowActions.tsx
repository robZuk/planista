import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Props {
  onEdit: () => void;
  onDelete: () => void;
  /** Dodatkowe pozycje nad "Edytuj" (np. "Pokaz plan"). */
  children?: React.ReactNode;
}

/** Menu "⋮" na koncu wiersza tabeli — edycja i usuwanie. */
export function RowActions({ onEdit, onDelete, children }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Akcje wiersza">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {children}
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil />
          Edytuj
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 />
          Usun
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
