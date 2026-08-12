import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { CheckCircle2, GripVertical, Info, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CLASS_COLORS, CLASS_FULL_LABELS, CLASS_LABELS } from '@/lib/scheduleDisplay';
import type { UnplannedItem } from '@/lib/unplannedItems';
import type { ClassType } from '@/types';

/**
 * Lista zajec, ktore siatka przewiduje, a wzorzec tygodnia jeszcze ich nie ma.
 *
 * Upuszczenie pozycji na siatke NIE zapisuje wzorca od razu — sali nie da sie
 * wywnioskowac z siatki, wiec drop otwiera dialog z uzupelnionym przedmiotem,
 * forma, grupa i terminem. Musi byc renderowana wewnatrz DndContext siatki.
 */
export function UnplannedPanel({
  items,
  missingGroupTypes,
  disabled,
}: {
  items: UnplannedItem[];
  missingGroupTypes: ClassType[];
  disabled?: boolean;
}) {
  if (items.length === 0) {
    // Pusty backlog ma DWIE rozne przyczyny i nie wolno ich mylic: albo wszystko jest
    // rozstawione, albo godziny wypadly z listy, bo nie ma dla nich grup. W drugim
    // przypadku zielone "wszystko ma swoj termin" bylo po prostu nieprawda — potrafilo
    // stac nad ostrzezeniem, ktore mowilo cos dokladnie odwrotnego, przy pustej siatce.
    const blockedByGroups = missingGroupTypes.length > 0;

    return (
      <div className="space-y-2 rounded-lg border border-dashed px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          {blockedByGroups ? (
            <>
              <TriangleAlert className="size-4 text-amber-600 dark:text-amber-400" />
              <span className="font-medium">Brak grup — tych godzin nie da sie rozstawic</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="size-4 text-primary" />
              <span className="font-medium">Wszystko z siatki ma juz swoj termin</span>
              <span className="text-muted-foreground">
                — dla tego semestru nie zostalo nic do rozstawienia.
              </span>
            </>
          )}
        </div>
        {/* Ikone niesie juz naglowek — druga, tuz pod nia, tylko halasuje. */}
        <MissingGroupsNote types={missingGroupTypes} hideIcon />
      </div>
    );
  }

  // Formy, ktorym backlog podstawil grupe innego typu — warto o tym powiedziec raz
  // pod lista, zamiast doklejac wyjasnienie do kazdego kafelka z osobna.
  const fallbackTypes = [
    ...new Set(items.filter((item) => item.groupIsFallback).map((item) => item.classType)),
  ];

  return (
    <div className="rounded-lg border border-dashed">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2">
        <span className="font-medium">Do zaplanowania</span>
        <Badge variant="secondary">{items.length}</Badge>
        <span className="text-xs text-muted-foreground">
          {disabled
            ? 'Podglad — planowanie wymaga uprawnien dziekanatu.'
            : 'Przeciagnij pozycje na siatke. Otworzy sie formularz z uzupelnionym przedmiotem, forma i grupa — zostanie wskazac sale.'}
        </span>
      </div>

      {/* Backlog potrafi miec kilkadziesiat pozycji (przedmiot x forma x grupa),
          wiec panel nie moze rosnac w nieskonczonosc ponad siatke. */}
      <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto p-3">
        {items.map((item) => (
          <UnplannedChip key={item.key} item={item} disabled={disabled} />
        ))}
      </div>

      {(fallbackTypes.length > 0 || missingGroupTypes.length > 0) && (
        <div className="space-y-1 border-t px-4 py-2">
          <FallbackGroupsNote types={fallbackTypes} />
          <MissingGroupsNote types={missingGroupTypes} />
        </div>
      )}
    </div>
  );
}

/**
 * Godziny formy, dla ktorej nie ma ani jednej grupy, nie moga trafic do backlogu —
 * wzorzec bez grupy nie przejdzie walidacji. Mowimy o tym wprost, zeby pusta lista
 * nie byla mylona z kompletnym planem.
 */
function MissingGroupsNote({ types, hideIcon }: { types: ClassType[]; hideIcon?: boolean }) {
  if (types.length === 0) return null;

  return (
    <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
      {!hideIcon && <TriangleAlert className="mt-px size-3.5 shrink-0" />}
      <span>
        Siatka przewiduje godziny form: {types.map((type) => CLASS_FULL_LABELS[type]).join(', ')},
        ale dla tego rocznika i specjalnosci nie ma zadnej grupy — a bez grupy nie da sie zalozyc
        wzorca. Zaloz grupy w zakladce Grupy.
      </span>
    </p>
  );
}

/**
 * Seminarium i projekt rzadko maja wlasne grupy, wiec backlog proponuje im sklad
 * cwiczeniowy (lub wykladowy). To podpowiedz, nie ustalenie — grupe wybiera sie
 * ostatecznie w formularzu wzorca, ktory nie ogranicza listy do jednego typu.
 */
function FallbackGroupsNote({ types }: { types: ClassType[] }) {
  if (types.length === 0) return null;

  return (
    <p className="flex items-start gap-2 text-xs text-muted-foreground">
      <Info className="mt-px size-3.5 shrink-0" />
      <span>
        Formy: {types.map((type) => CLASS_FULL_LABELS[type]).join(', ')} nie maja wlasnych grup —
        kafelki (kursywa przy nazwie) proponuja grupe zastepcza. Przy zapisie mozna wskazac inna.
      </span>
    </p>
  );
}

function UnplannedChip({ item, disabled }: { item: UnplannedItem; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.key,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 50 : undefined,
      }}
      {...listeners}
      {...attributes}
      className={cn(
        'flex max-w-64 items-start gap-1 rounded-md border-l-4 px-2 py-1 text-[11px] leading-tight shadow-sm',
        CLASS_COLORS[item.classType],
        disabled ? 'cursor-not-allowed' : 'cursor-grab',
      )}
    >
      {!disabled && <GripVertical className="mt-px size-3 shrink-0 opacity-60" />}
      <div className="min-w-0">
        <div className="line-clamp-2 font-medium">
          {CLASS_LABELS[item.classType]} · {item.subjectName}
        </div>
        <div
          className={cn('opacity-80', item.groupIsFallback && 'italic')}
          title={
            item.groupIsFallback
              ? 'Grupa zastepcza — dla tej formy nie ma wlasnych grup. Mozna ja zmienic w formularzu.'
              : undefined
          }
        >
          {item.group.name}
        </div>
        {/* Godziny tygodniowe wynikaja z kalendarza i sluza tylko doborowi dlugosci
            bloku przy dropie — na chipie pokazujemy wymiar z siatki, czyli semestr. */}
        <div className="opacity-80">{item.requiredSemesterHours} h w semestrze</div>
      </div>
    </div>
  );
}
