import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, DoorOpen, MapPin, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
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
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  createBuilding,
  createRoom,
  deleteBuilding,
  deleteRoom,
  fetchBuildings,
  updateBuilding,
  updateRoom,
  type BuildingInput,
  type RoomInput,
} from '@/api/buildings';
import { fetchFaculties } from '@/api/faculties';
import { getErrorMessage } from '@/lib/errors';
import { ROOM_TYPES, ROOM_TYPE_LABELS } from '@/lib/labels';
import { useAuthStore } from '@/store/authStore';
import type { Building, Room, RoomType } from '@/types';

const NO_FACULTY = '__none__';

const buildingSchema = z.object({
  name: z.string().min(2, 'Nazwa musi miec co najmniej 2 znaki'),
  address: z.string().optional(),
  facultyId: z.string().optional(),
});

const roomSchema = z.object({
  number: z.string().min(1, 'Podaj numer sali'),
  type: z.enum(ROOM_TYPES as [RoomType, ...RoomType[]]),
  // Liczbe robi z tego rejestracja pola (valueAsNumber), nie z.coerce — coerce daje
  // typ wejsciowy `unknown`, czego resolver react-hook-form nie akceptuje.
  capacity: z
    .number({ message: 'Podaj liczbe' })
    .int('Pojemnosc musi byc liczba calkowita')
    .min(1, 'Pojemnosc musi byc wieksza od zera'),
});

type BuildingValues = z.infer<typeof buildingSchema>;
type RoomValues = z.infer<typeof roomSchema>;

/** Sala razem z budynkiem, w ktorym siedzi — potrzebne przy edycji i usuwaniu. */
interface RoomRef {
  buildingId: string;
  room: Room;
}

export default function BuildingsPage() {
  const queryClient = useQueryClient();
  const canEdit = useAuthStore((s) => s.user?.role) === 'ADMIN';

  const [buildingDialog, setBuildingDialog] = useState(false);
  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null);
  const [deletingBuilding, setDeletingBuilding] = useState<Building | null>(null);

  const [roomDialog, setRoomDialog] = useState(false);
  const [roomTarget, setRoomTarget] = useState<{ buildingId: string; room: Room | null } | null>(null);
  const [deletingRoom, setDeletingRoom] = useState<RoomRef | null>(null);
  const [facultyFilter, setFacultyFilter] = useState<string>('all');

  const { data: buildings, isPending } = useQuery({
    queryKey: ['buildings'],
    queryFn: fetchBuildings,
  });
  const { data: faculties } = useQuery({ queryKey: ['faculties'], queryFn: fetchFaculties });

  // Budynek ma opcjonalny wydzial — filtr zawezamy tu, obok listy w Accordionie.
  const visible = useMemo(() => {
    if (facultyFilter === 'all') return buildings;
    if (facultyFilter === NO_FACULTY) return buildings?.filter((b) => !b.facultyId);
    return buildings?.filter((b) => b.facultyId === facultyFilter);
  }, [buildings, facultyFilter]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['buildings'] });

  const buildingForm = useForm<BuildingValues>({
    resolver: zodResolver(buildingSchema),
    defaultValues: { name: '', address: '', facultyId: NO_FACULTY },
  });

  const roomForm = useForm<RoomValues>({
    resolver: zodResolver(roomSchema),
    defaultValues: { number: '', type: 'LECTURE', capacity: 30 },
  });

  const saveBuilding = useMutation({
    mutationFn: (values: BuildingValues) => {
      const payload: BuildingInput = {
        name: values.name,
        address: values.address || undefined,
        facultyId: values.facultyId === NO_FACULTY ? undefined : values.facultyId,
      };
      return editingBuilding ? updateBuilding(editingBuilding.id, payload) : createBuilding(payload);
    },
    onSuccess: () => {
      toast.success(editingBuilding ? 'Budynek zaktualizowany' : 'Budynek dodany');
      setBuildingDialog(false);
      void invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const removeBuilding = useMutation({
    mutationFn: (id: string) => deleteBuilding(id),
    onSuccess: () => {
      toast.success('Budynek usuniety');
      setDeletingBuilding(null);
      void invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const saveRoom = useMutation({
    mutationFn: (values: RoomValues) => {
      if (!roomTarget) throw new Error('Brak budynku');
      const payload: RoomInput = {
        number: values.number,
        type: values.type,
        capacity: values.capacity,
      };
      return roomTarget.room
        ? updateRoom(roomTarget.buildingId, roomTarget.room.id, payload)
        : createRoom(roomTarget.buildingId, payload);
    },
    onSuccess: () => {
      toast.success(roomTarget?.room ? 'Sala zaktualizowana' : 'Sala dodana');
      setRoomDialog(false);
      void invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const removeRoom = useMutation({
    mutationFn: ({ buildingId, room }: RoomRef) => deleteRoom(buildingId, room.id),
    onSuccess: () => {
      toast.success('Sala usunieta');
      setDeletingRoom(null);
      void invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const openCreateBuilding = () => {
    setEditingBuilding(null);
    buildingForm.reset({ name: '', address: '', facultyId: NO_FACULTY });
    setBuildingDialog(true);
  };

  const openEditBuilding = (building: Building) => {
    setEditingBuilding(building);
    buildingForm.reset({
      name: building.name,
      address: building.address ?? '',
      facultyId: building.facultyId ?? NO_FACULTY,
    });
    setBuildingDialog(true);
  };

  const openCreateRoom = (buildingId: string) => {
    setRoomTarget({ buildingId, room: null });
    roomForm.reset({ number: '', type: 'LECTURE', capacity: 30 });
    setRoomDialog(true);
  };

  const openEditRoom = (buildingId: string, room: Room) => {
    setRoomTarget({ buildingId, room });
    roomForm.reset({ number: room.number, type: room.type, capacity: room.capacity });
    setRoomDialog(true);
  };

  return (
    <>
      <PageHeader
        title="Budynki i sale"
        description="Rozwin budynek, zeby zobaczyc i edytowac jego sale."
        actions={
          canEdit && (
            <Button onClick={openCreateBuilding}>
              <Plus />
              Dodaj budynek
            </Button>
          )
        }
      />

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : buildings?.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Building2 />
            </EmptyMedia>
            <EmptyTitle>Brak budynkow</EmptyTitle>
            <EmptyDescription>
              Sale mieszkaja w budynkach — zacznij od dodania pierwszego budynku.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="mb-4">
            <Select value={facultyFilter} onValueChange={setFacultyFilter}>
              <SelectTrigger className="w-56" aria-label="Wydzial">
                <SelectValue placeholder="Wydzial" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie wydzialy</SelectItem>
                <SelectItem value={NO_FACULTY}>Ogolnouczelniane</SelectItem>
                {faculties?.map((faculty) => (
                  <SelectItem key={faculty.id} value={faculty.id}>
                    {faculty.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {visible?.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Building2 />
                </EmptyMedia>
                <EmptyTitle>Brak budynkow dla tego filtra</EmptyTitle>
                <EmptyDescription>
                  Zaden budynek nie pasuje do wybranego wydzialu — zmien filtr powyzej.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            // type="multiple" — mozna miec otwartych kilka budynkow naraz przy porownywaniu sal.
            <Accordion type="multiple" className="w-full">
              {visible?.map((building) => {
            const rooms = building.rooms ?? [];
            const seats = rooms.reduce((sum, room) => sum + room.capacity, 0);

            return (
              <AccordionItem key={building.id} value={building.id}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 pr-2 text-left">
                    <Building2 className="size-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium">{building.name}</span>
                    {building.faculty && (
                      <Badge variant="secondary">{building.faculty.shortName}</Badge>
                    )}
                    {building.address && (
                      <span className="flex items-center gap-1 text-sm font-normal text-muted-foreground">
                        <MapPin className="size-3.5" />
                        {building.address}
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-3 text-sm font-normal text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <DoorOpen className="size-3.5" />
                        {rooms.length}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="size-3.5" />
                        {seats}
                      </span>
                    </span>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="space-y-3">
                  {canEdit && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => openCreateRoom(building.id)}>
                        <Plus />
                        Dodaj sale
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEditBuilding(building)}>
                        <Pencil />
                        Edytuj budynek
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDeletingBuilding(building)}
                      >
                        <Trash2 />
                        Usun budynek
                      </Button>
                    </div>
                  )}

                  {rooms.length === 0 ? (
                    <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                      Ten budynek nie ma jeszcze zadnej sali.
                    </p>
                  ) : (
                    <div className="overflow-hidden rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Numer</TableHead>
                            <TableHead>Typ</TableHead>
                            <TableHead className="text-right">Pojemnosc</TableHead>
                            {canEdit && <TableHead className="w-24" />}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rooms.map((room) => (
                            <TableRow key={room.id}>
                              <TableCell className="font-medium">{room.number}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{ROOM_TYPE_LABELS[room.type]}</Badge>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {room.capacity}
                              </TableCell>
                              {canEdit && (
                                <TableCell>
                                  <div className="flex justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-8"
                                      aria-label={`Edytuj sale ${room.number}`}
                                      onClick={() => openEditRoom(building.id, room)}
                                    >
                                      <Pencil />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-8 text-destructive hover:text-destructive"
                                      aria-label={`Usun sale ${room.number}`}
                                      onClick={() => setDeletingRoom({ buildingId: building.id, room })}
                                    >
                                      <Trash2 />
                                    </Button>
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
              })}
            </Accordion>
          )}
        </>
      )}

      {/* ─── Dialog budynku ─── */}
      <Dialog open={buildingDialog} onOpenChange={setBuildingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingBuilding ? 'Edytuj budynek' : 'Nowy budynek'}</DialogTitle>
            <DialogDescription>
              Przypisanie do wydzialu jest opcjonalne — sluzy do filtrowania sal.
            </DialogDescription>
          </DialogHeader>

          <form
            id="building-form"
            onSubmit={buildingForm.handleSubmit((values) => saveBuilding.mutate(values))}
            noValidate
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="buildingName">Nazwa</FieldLabel>
                <Input
                  id="buildingName"
                  placeholder="Budynek A"
                  aria-invalid={!!buildingForm.formState.errors.name}
                  {...buildingForm.register('name')}
                />
                <FieldError errors={[buildingForm.formState.errors.name]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="address">Adres (opcjonalnie)</FieldLabel>
                <Input id="address" placeholder="ul. Morska 81-87" {...buildingForm.register('address')} />
              </Field>

              <Field>
                <FieldLabel htmlFor="buildingFaculty">Wydzial (opcjonalnie)</FieldLabel>
                <Controller
                  control={buildingForm.control}
                  name="facultyId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="buildingFaculty">
                        <SelectValue placeholder="Wybierz wydzial" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_FACULTY}>Bez wydzialu</SelectItem>
                        {faculties?.map((faculty) => (
                          <SelectItem key={faculty.id} value={faculty.id}>
                            {faculty.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </FieldGroup>
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBuildingDialog(false)}>
              Anuluj
            </Button>
            <Button type="submit" form="building-form" disabled={saveBuilding.isPending}>
              {saveBuilding.isPending && <Spinner />}
              {editingBuilding ? 'Zapisz zmiany' : 'Dodaj'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog sali ─── */}
      <Dialog open={roomDialog} onOpenChange={setRoomDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{roomTarget?.room ? 'Edytuj sale' : 'Nowa sala'}</DialogTitle>
            <DialogDescription>
              Pojemnosc decyduje o tym, jakie grupy zmieszcza sie w tej sali.
            </DialogDescription>
          </DialogHeader>

          <form
            id="room-form"
            onSubmit={roomForm.handleSubmit((values) => saveRoom.mutate(values))}
            noValidate
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="roomNumber">Numer</FieldLabel>
                <Input
                  id="roomNumber"
                  placeholder="101"
                  aria-invalid={!!roomForm.formState.errors.number}
                  {...roomForm.register('number')}
                />
                <FieldError errors={[roomForm.formState.errors.number]} />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="roomType">Typ</FieldLabel>
                  <Controller
                    control={roomForm.control}
                    name="type"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="roomType">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROOM_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {ROOM_TYPE_LABELS[type]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="capacity">Pojemnosc</FieldLabel>
                  <Input
                    id="capacity"
                    type="number"
                    min={1}
                    aria-invalid={!!roomForm.formState.errors.capacity}
                    {...roomForm.register('capacity', { valueAsNumber: true })}
                  />
                  <FieldError errors={[roomForm.formState.errors.capacity]} />
                </Field>
              </div>
            </FieldGroup>
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRoomDialog(false)}>
              Anuluj
            </Button>
            <Button type="submit" form="room-form" disabled={saveRoom.isPending}>
              {saveRoom.isPending && <Spinner />}
              {roomTarget?.room ? 'Zapisz zmiany' : 'Dodaj'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deletingBuilding}
        onOpenChange={(open) => !open && setDeletingBuilding(null)}
        title={`Usunac budynek ${deletingBuilding?.name ?? ''}?`}
        description="Tej operacji nie da sie cofnac. Budynek z salami nie zostanie usuniety — najpierw usun sale."
        isPending={removeBuilding.isPending}
        onConfirm={() => deletingBuilding && removeBuilding.mutate(deletingBuilding.id)}
      />

      <ConfirmDialog
        open={!!deletingRoom}
        onOpenChange={(open) => !open && setDeletingRoom(null)}
        title={`Usunac sale ${deletingRoom?.room.number ?? ''}?`}
        description="Tej operacji nie da sie cofnac. Sala uzywana w planie zajec nie zostanie usunieta."
        isPending={removeRoom.isPending}
        onConfirm={() => deletingRoom && removeRoom.mutate(deletingRoom)}
      />
    </>
  );
}
