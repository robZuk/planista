import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, MapPin, Pin, Trash2, User, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { deleteEntry, moveEntry, updateEntryStatus } from '@/api/schedule';
import { fetchTimeBlocks } from '@/api/timeBlocks';
import { fetchBuildings } from '@/api/buildings';
import { fetchInstructors } from '@/api/instructors';
import { getScheduleErrorMessage } from '@/lib/scheduleErrors';
import { CLASS_FULL_LABELS, ROOM_TYPES_FOR_CLASS, STATUS_LABELS } from '@/lib/scheduleDisplay';
import { formatDateLong, toDateKey } from '@/lib/scheduleDates';
import type { EntryStatus, ScheduleEntry } from '@/types';

interface Props {
  entry: ScheduleEntry | null;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
  /** Granice semestru (RRRR-MM-DD) — ograniczaja wybor daty. null = brak zawezenia. */
  semesterRange?: { startKey: string; endKey: string } | null;
}

/** Szczegoly jednego terminu: status, przeniesienie i usuniecie. */
export function EntryDialog({ entry, onOpenChange, canEdit, semesterRange }: Props) {
  const queryClient = useQueryClient();
  const { data: blocks } = useQuery({ queryKey: ['time-blocks'], queryFn: fetchTimeBlocks });
  const { data: buildings } = useQuery({ queryKey: ['buildings'], queryFn: fetchBuildings });
  const { data: instructors } = useQuery({ queryKey: ['instructors'], queryFn: fetchInstructors });

  const [moveDate, setMoveDate] = useState('');
  const [moveStartBlockId, setMoveStartBlockId] = useState('');
  const [moveRoomId, setMoveRoomId] = useState('');
  const [moveInstructorId, setMoveInstructorId] = useState('');
  const [scope, setScope] = useState<'ONE' | 'ALL'>('ONE');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setMoveDate(toDateKey(entry.date));
    setMoveStartBlockId(entry.startBlock.id);
    setMoveRoomId(entry.room.id);
    setMoveInstructorId(entry.instructor.id);
    setScope('ONE');
  }, [entry]);

  const rooms = useMemo(
    () =>
      buildings?.flatMap((building) =>
        (building.rooms ?? []).map((room) => ({
          ...room,
          buildingName: building.name,
          facultyId: building.faculty?.id ?? null,
          facultyName: building.faculty?.name ?? null,
        })),
      ) ?? [],
    [buildings],
  );

  // Sale pasujace do formy zajec tego terminu, pogrupowane po wydziale (przez budynek).
  const roomsByFaculty = useMemo(() => {
    const allowed = entry ? ROOM_TYPES_FOR_CLASS[entry.classType] : [];
    const available = rooms.filter((room) => allowed.includes(room.type));
    const map = new Map<string, { facultyName: string; items: typeof available }>();
    for (const room of available) {
      const key = room.facultyId ?? '__none__';
      if (!map.has(key)) map.set(key, { facultyName: room.facultyName ?? 'Bez wydzialu', items: [] });
      map.get(key)!.items.push(room);
    }
    return [...map.entries()]
      .sort(([keyA, a], [keyB, b]) => {
        if (keyA === '__none__') return 1;
        if (keyB === '__none__') return -1;
        return a.facultyName.localeCompare(b.facultyName, 'pl');
      })
      .map(([, group]) => group);
  }, [rooms, entry]);

  // Prowadzacy pogrupowani po wydziale; bez wydzialu -> sekcja na koncu.
  const instructorsByFaculty = useMemo(() => {
    type Ins = NonNullable<typeof instructors>[number];
    const map = new Map<string, { facultyName: string; items: Ins[] }>();
    for (const instructor of instructors ?? []) {
      const key = instructor.faculty?.id ?? '__none__';
      if (!map.has(key)) {
        map.set(key, { facultyName: instructor.faculty?.name ?? 'Bez wydzialu', items: [] });
      }
      map.get(key)!.items.push(instructor);
    }
    return [...map.entries()]
      .sort(([keyA, a], [keyB, b]) => {
        if (keyA === '__none__') return 1;
        if (keyB === '__none__') return -1;
        return a.facultyName.localeCompare(b.facultyName, 'pl');
      })
      .map(([, group]) => group);
  }, [instructors]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['schedule-entries'] });
    void queryClient.invalidateQueries({ queryKey: ['coverage'] });
  };

  const statusMutation = useMutation({
    mutationFn: (status: EntryStatus) => updateEntryStatus(entry!.id, status),
    onSuccess: () => {
      toast.success('Status zmieniony');
      invalidate();
    },
    onError: (error) => toast.error(getScheduleErrorMessage(error)),
  });

  const moveMutation = useMutation({
    mutationFn: () => {
      const start = blocks?.find((block) => block.id === moveStartBlockId);
      if (!start) throw new Error('Nieprawidlowy blok');
      // Dlugosc zajec zostaje bez zmian — przesuwamy tylko poczatek.
      const span = entry!.endBlock.order - entry!.startBlock.order;
      const end = blocks?.find((block) => block.order === start.order + span);
      if (!end) throw new Error('Zajecia nie zmieszcza sie do konca dnia');
      return moveEntry(entry!.id, {
        newDate: moveDate,
        newStartBlockId: start.id,
        newEndBlockId: end.id,
        newRoomId: moveRoomId,
        newInstructorId: moveInstructorId,
        scope,
      });
    },
    onSuccess: (response) => {
      toast.success(response.message ?? 'Termin przeniesiony');
      invalidate();
      onOpenChange(false);
    },
    onError: (error) => toast.error(getScheduleErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteEntry(entry!.id, scope),
    onSuccess: (response) => {
      toast.success(response.message ?? 'Termin usuniety');
      setConfirmDelete(false);
      invalidate();
      onOpenChange(false);
    },
    onError: (error) => toast.error(getScheduleErrorMessage(error)),
  });

  if (!entry) return null;

  const moved =
    moveDate !== toDateKey(entry.date) ||
    moveStartBlockId !== entry.startBlock.id ||
    moveRoomId !== entry.room.id ||
    moveInstructorId !== entry.instructor.id;

  // Wybrana data poza semestrem — blokujemy zapis (backend i tak odrzuci).
  const dateOutOfRange =
    !!semesterRange && (moveDate < semesterRange.startKey || moveDate > semesterRange.endKey);

  return (
    <>
      <Dialog open={!!entry} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{entry.curriculumEntry.subject.name}</DialogTitle>
            <DialogDescription>
              {CLASS_FULL_LABELS[entry.classType]} · {formatDateLong(entry.date)} ·{' '}
              {entry.startBlock.startTime}–{entry.endBlock.endTime}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <MapPin className="size-4 text-muted-foreground" />
              {entry.room.building.name} · sala {entry.room.number}
            </div>
            <div className="flex items-center gap-2">
              <User className="size-4 text-muted-foreground" />
              {`${entry.instructor.title ?? ''} ${entry.instructor.firstName} ${entry.instructor.lastName}`.trim()}
            </div>
            <div className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              {entry.studentGroup?.name ?? 'Caly rocznik'}
            </div>
            <div className="flex items-center gap-2">
              <CalendarClock className="size-4 text-muted-foreground" />
              <Badge variant={entry.status === 'CANCELLED' ? 'outline' : 'secondary'}>
                {STATUS_LABELS[entry.status]}
              </Badge>
              {entry.detached && (
                <Badge variant="outline" className="gap-1">
                  <Pin className="size-3" />
                  Odczepiony
                </Badge>
              )}
            </div>
            {entry.detached && (
              <p className="text-xs text-muted-foreground">
                Ten termin był ręcznie zmieniany — przenoszenie całej serii go pomija, a ponowne
                generowanie go nie odtworzy.
              </p>
            )}
          </div>

          {canEdit && (
            <>
              <Separator />

              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="entryStatus">Status</FieldLabel>
                  <Select
                    value={entry.status}
                    onValueChange={(value) => statusMutation.mutate(value as EntryStatus)}
                  >
                    <SelectTrigger id="entryStatus">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATUS_LABELS) as EntryStatus[]).map((status) => (
                        <SelectItem key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Odwolane zajecia zostaja w kalendarzu, ale zwalniaja sale i prowadzacego.
                  </FieldDescription>
                </Field>

                <Separator />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="moveRoom">Sala</FieldLabel>
                    <Select value={moveRoomId} onValueChange={setMoveRoomId}>
                      <SelectTrigger id="moveRoom">
                        <SelectValue placeholder="Wybierz sale" />
                      </SelectTrigger>
                      <SelectContent>
                        {roomsByFaculty.map((group) => (
                          <SelectGroup key={group.facultyName}>
                            <SelectLabel>{group.facultyName}</SelectLabel>
                            {group.items.map((room) => (
                              <SelectItem key={room.id} value={room.id}>
                                {room.buildingName} · {room.number} ({room.capacity} os.)
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="moveInstructor">Prowadzacy</FieldLabel>
                    <Select value={moveInstructorId} onValueChange={setMoveInstructorId}>
                      <SelectTrigger id="moveInstructor">
                        <SelectValue placeholder="Wybierz prowadzacego" />
                      </SelectTrigger>
                      <SelectContent>
                        {instructorsByFaculty.map((group) => (
                          <SelectGroup key={group.facultyName}>
                            <SelectLabel>{group.facultyName}</SelectLabel>
                            {group.items.map((instructor) => (
                              <SelectItem key={instructor.id} value={instructor.id}>
                                {`${instructor.title ?? ''} ${instructor.firstName} ${instructor.lastName}`.trim()}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="moveDate">Nowa data</FieldLabel>
                    <Input
                      id="moveDate"
                      type="date"
                      value={moveDate}
                      min={semesterRange?.startKey}
                      max={semesterRange?.endKey}
                      aria-invalid={dateOutOfRange}
                      onChange={(event) => setMoveDate(event.target.value)}
                    />
                    {dateOutOfRange && (
                      <FieldDescription className="text-destructive">
                        Data poza zakresem semestru ({semesterRange!.startKey} – {semesterRange!.endKey}).
                      </FieldDescription>
                    )}
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="moveBlock">Nowa godzina</FieldLabel>
                    <Select value={moveStartBlockId} onValueChange={setMoveStartBlockId}>
                      <SelectTrigger id="moveBlock">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {blocks?.map((block) => (
                          <SelectItem key={block.id} value={block.id}>
                            {block.startTime}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <Field>
                  <FieldLabel>Zakres operacji</FieldLabel>
                  <RadioGroup value={scope} onValueChange={(value) => setScope(value as 'ONE' | 'ALL')}>
                    <FieldLabel htmlFor="scope-one" className="font-normal">
                      <RadioGroupItem value="ONE" id="scope-one" />
                      Tylko ten termin
                    </FieldLabel>
                    <FieldLabel htmlFor="scope-all" className="font-normal">
                      <RadioGroupItem value="ALL" id="scope-all" disabled={!entry.template} />
                      Ten i wszystkie kolejne z tej serii
                    </FieldLabel>
                  </RadioGroup>
                  <FieldDescription>
                    Obie opcje zmieniaja tylko kalendarz — wzorzec tygodnia zostaje bez zmian,
                    a przy nastepnym generowaniu semestru plan powstanie od nowa z wzorcow.
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </>
          )}

          <DialogFooter className="sm:justify-between">
            {canEdit ? (
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 />
                Usun termin
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Zamknij
              </Button>
              {canEdit && (
                <Button
                  onClick={() => moveMutation.mutate()}
                  disabled={!moved || dateOutOfRange || moveMutation.isPending}
                >
                  {moveMutation.isPending && <Spinner />}
                  Zapisz zmiany
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={scope === 'ALL' ? 'Usunac ten i wszystkie kolejne terminy?' : 'Usunac ten termin?'}
        description={
          scope === 'ALL'
            ? 'Znika ten termin i wszystkie kolejne z tej serii (poza odczepionymi). Wzorzec tygodnia zostaje, wiec kolejne generowanie moze je odtworzyc.'
            : 'Znika tylko ten jeden termin. Wzorzec tygodnia zostaje, wiec kolejne generowanie moze go odtworzyc.'
        }
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </>
  );
}
