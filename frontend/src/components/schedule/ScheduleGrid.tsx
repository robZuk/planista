import type { CSSProperties, ReactNode } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import type { TimeBlock } from '@/types';

export const ROW_HEIGHT = 52; // px na 1 blok (1 godzina)
export const HEADER_HEIGHT = 44; // px naglowka kolumny

/** Lewa kolumna z godzinami, wyrownana do wierszy siatki. */
export function TimeBlockColumn({ blocks }: { blocks: TimeBlock[] }) {
  return (
    <div className="w-16 shrink-0 border-r">
      <div style={{ height: HEADER_HEIGHT }} className="border-b" />
      {blocks.map((block) => (
        <div
          key={block.id}
          style={{ height: ROW_HEIGHT }}
          className="flex items-start justify-end border-t border-border/60 px-2 pt-1 text-xs tabular-nums text-muted-foreground first:border-transparent"
        >
          {block.startTime}
        </div>
      ))}
    </div>
  );
}

/**
 * Jedna komorka siatki (kolumna x wiersz bloku). `id` = "${columnKey}::${blockId}" —
 * ten format rozbieramy w onDragEnd, zeby wiedziec, gdzie wyladowal blok.
 */
export function DroppableCell({
  id,
  rowIndex,
  disabled,
  onClick,
}: {
  id: string;
  rowIndex: number;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      style={{ position: 'absolute', top: rowIndex * ROW_HEIGHT, height: ROW_HEIGHT, left: 0, right: 0 }}
      className={cn(
        'border-t border-border/60 first:border-transparent',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-muted/60',
        isOver && !disabled && 'bg-accent',
      )}
    />
  );
}

/**
 * Blok zajec w siatce. Pozycja pionowa wynika wprost z indeksu wiersza i liczby
 * zajmowanych blokow — bez arytmetyki minutowej, bo siatka jest z definicji godzinowa.
 */
export function DraggableBlock({
  id,
  startRowIndex,
  blockCount,
  colorClass,
  onClick,
  disabled,
  children,
}: {
  id: string;
  startRowIndex: number;
  blockCount: number;
  colorClass: string;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, disabled });

  const style: CSSProperties = {
    position: 'absolute',
    top: startRowIndex * ROW_HEIGHT + 1,
    height: blockCount * ROW_HEIGHT - 2,
    left: 3,
    right: 3,
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : 1,
    cursor: disabled ? 'pointer' : 'grab',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={(event) => {
        // Bez tego klikniecie w blok trafialoby tez w komorke pod spodem.
        event.stopPropagation();
        onClick?.();
      }}
      className={cn(
        'overflow-hidden rounded-md border-l-4 px-2 py-1 text-[11px] leading-tight shadow-sm',
        colorClass,
      )}
    >
      {children}
    </div>
  );
}

/** Naglowek kolumny dnia (lub daty w kalendarzu). */
export function ColumnHeader({
  title,
  subtitle,
  highlighted,
}: {
  title: string;
  subtitle?: string;
  highlighted?: boolean;
}) {
  return (
    <div
      style={{ height: HEADER_HEIGHT }}
      className={cn(
        'flex flex-col items-center justify-center border-b text-sm font-medium',
        highlighted && 'bg-primary/10 text-primary',
      )}
    >
      <span>{title}</span>
      {subtitle && <span className="text-xs font-normal text-muted-foreground">{subtitle}</span>}
    </div>
  );
}
