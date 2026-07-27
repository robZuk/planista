import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, Plus, ShieldCheck } from 'lucide-react';
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
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Combobox } from '@/components/Combobox';
import { MultiCombobox } from '@/components/MultiCombobox';
import { DataTable } from '@/components/data-table/DataTable';
import { RowActions } from '@/components/data-table/RowActions';
import { SortableHeader } from '@/components/data-table/SortableHeader';
import {
  createUser,
  deleteUser,
  fetchUsers,
  impersonateUser,
  updateUser,
  type UserInput,
} from '@/api/users';
import { fetchInstructors } from '@/api/instructors';
import { fetchGroups } from '@/api/groups';
import { fetchFaculties } from '@/api/faculties';
import { getErrorMessage } from '@/lib/errors';
import { ROLE_LABELS } from '@/lib/navigation';
import { formatDateLong } from '@/lib/scheduleDates';
import { useAuthStore } from '@/store/authStore';
import type { Role, UserListItem } from '@/types';

const ROLES: Role[] = ['ADMIN', 'DEAN_OFFICE', 'INSTRUCTOR', 'STUDENT'];

/** Radix Select nie przyjmuje pustego stringa — wartownik dla "bez powiazania". */
const NO_INSTRUCTOR = '__none__';

/**
 * Haslo jest wymagane tylko przy zakladaniu konta. Przy edycji puste pole
 * znaczy "nie zmieniaj", wiec walidacja zalezy od trybu — stad fabryka schematu.
 */
function userSchema(isEdit: boolean) {
  return z.object({
    name: z.string().min(3, 'Podaj imie i nazwisko'),
    email: z.string().min(1, 'Podaj adres email').email('To nie wyglada na adres email'),
    password: isEdit
      ? z.string().refine((v) => v === '' || v.length >= 8, 'Haslo musi miec co najmniej 8 znakow')
      : z.string().min(8, 'Haslo musi miec co najmniej 8 znakow'),
    role: z.enum(['ADMIN', 'DEAN_OFFICE', 'INSTRUCTOR', 'STUDENT']),
    instructorId: z.string().optional(),
    facultyId: z.string().optional(),
    studentGroupIds: z.array(z.string()),
  });
}

type UserValues = z.infer<ReturnType<typeof userSchema>>;

const EMPTY: UserValues = {
  name: '',
  email: '',
  password: '',
  role: 'STUDENT',
  instructorId: NO_INSTRUCTOR,
  facultyId: '',
  studentGroupIds: [],
};

const COLUMN_LABELS = {
  name: 'Imie i nazwisko',
  email: 'E-mail',
  role: 'Rola',
  link: 'Powiazanie',
  createdAt: 'Utworzono',
};

const ROLE_BADGE: Record<Role, 'default' | 'secondary' | 'outline'> = {
  ADMIN: 'default',
  DEAN_OFFICE: 'secondary',
  INSTRUCTOR: 'outline',
  STUDENT: 'outline',
};

export default function UsersPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const startImpersonating = useAuthStore((s) => s.impersonate);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UserListItem | null>(null);
  const [deleting, setDeleting] = useState<UserListItem | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const { data: users, isPending } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
  const { data: instructors } = useQuery({ queryKey: ['instructors'], queryFn: fetchInstructors });
  const { data: groups } = useQuery({ queryKey: ['groups', 'all'], queryFn: () => fetchGroups({}) });
  const { data: faculties } = useQuery({ queryKey: ['faculties'], queryFn: fetchFaculties });

  const visible = useMemo(() => {
    if (roleFilter === 'all') return users;
    return users?.filter((user) => user.role === roleFilter);
  }, [users, roleFilter]);

  // Schemat zalezy od trybu (haslo obowiazkowe tylko przy zakladaniu konta),
  // wiec przebudowujemy go dopiero przy zmianie edytowanego rekordu.
  const resolver = useMemo(() => zodResolver(userSchema(!!editing)), [editing]);
  const form = useForm<UserValues>({ resolver, defaultValues: EMPTY });

  // Powiazania sa rozne dla roznych rol — pola pokazujemy zaleznie od wyboru.
  const role = form.watch('role');

  const instructorOptions = useMemo(
    () =>
      (instructors ?? []).map((instructor) => ({
        value: instructor.id,
        label: `${instructor.title ?? ''} ${instructor.firstName} ${instructor.lastName}`.trim(),
        keywords: instructor.email,
      })),
    [instructors],
  );

  const groupOptions = useMemo(
    () => (groups ?? []).map((group) => ({ value: group.id, label: group.name })),
    [groups],
  );

  const facultyOptions = useMemo(
    () =>
      (faculties ?? []).map((faculty) => ({
        value: faculty.id,
        label: `${faculty.name} (${faculty.shortName})`,
        keywords: faculty.shortName,
      })),
    [faculties],
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const saveMutation = useMutation({
    mutationFn: (values: UserValues) => {
      const payload: UserInput = {
        name: values.name,
        email: values.email,
        role: values.role,
        // Backend czysci powiazania niepasujace do roli, ale wysylamy juz zawezone.
        instructorId:
          values.role === 'INSTRUCTOR' && values.instructorId !== NO_INSTRUCTOR
            ? values.instructorId
            : null,
        facultyId:
          values.role === 'DEAN_OFFICE' && values.facultyId ? values.facultyId : null,
        studentGroupIds: values.role === 'STUDENT' ? values.studentGroupIds : [],
        ...(values.password ? { password: values.password } : {}),
      };
      return editing ? updateUser(editing.id, payload) : createUser(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Konto zaktualizowane' : 'Konto utworzone');
      setDialogOpen(false);
      void invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      toast.success('Konto usuniete');
      setDeleting(null);
      void invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const impersonateMutation = useMutation({
    mutationFn: (id: string) => impersonateUser(id),
    onSuccess: ({ accessToken, user }) => {
      startImpersonating(accessToken, user);
      // Cache trzyma dane widziane oczami admina — po zmianie tozsamosci
      // musi zniknac w calosci, inaczej podglad pokazywalby cudze wyniki.
      queryClient.clear();
      navigate('/', { replace: true });
      toast.success(`Podglad jako ${user.name}`);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const openCreate = () => {
    setEditing(null);
    form.reset(EMPTY);
    setDialogOpen(true);
  };

  const openEdit = (user: UserListItem) => {
    setEditing(user);
    form.reset({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      instructorId: user.instructorId ?? NO_INSTRUCTOR,
      facultyId: user.facultyId ?? '',
      studentGroupIds: user.studentGroups.map((group) => group.id),
    });
    setDialogOpen(true);
  };

  const columns: ColumnDef<UserListItem, unknown>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => <SortableHeader column={column}>Imie i nazwisko</SortableHeader>,
      cell: ({ row }) => (
        <span className="font-medium">
          {row.original.name}
          {row.original.id === me?.id && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">(to Ty)</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: 'email',
      header: ({ column }) => <SortableHeader column={column}>E-mail</SortableHeader>,
      cell: ({ row }) => (
        <a href={`mailto:${row.original.email}`} className="text-primary hover:underline">
          {row.original.email}
        </a>
      ),
    },
    {
      accessorKey: 'role',
      header: ({ column }) => <SortableHeader column={column}>Rola</SortableHeader>,
      cell: ({ row }) => (
        <Badge variant={ROLE_BADGE[row.original.role]}>{ROLE_LABELS[row.original.role]}</Badge>
      ),
    },
    {
      id: 'link',
      // Plaski tekst — inaczej globalna szukajka i sortowanie nie maja po czym dzialac.
      accessorFn: (row) =>
        row.instructor
          ? `${row.instructor.firstName} ${row.instructor.lastName}`
          : row.studentGroups.map((group) => group.name).join(' '),
      header: 'Powiazanie',
      cell: ({ row }) => {
        const { instructor, studentGroups } = row.original;
        if (instructor) {
          return (
            <span className="text-sm">
              {`${instructor.title ?? ''} ${instructor.firstName} ${instructor.lastName}`.trim()}
            </span>
          );
        }
        if (studentGroups.length > 0) {
          return (
            <div className="flex flex-wrap gap-1">
              {studentGroups.map((group) => (
                <Badge key={group.id} variant="secondary">
                  {group.name}
                </Badge>
              ))}
            </div>
          );
        }
        return <span className="text-muted-foreground">—</span>;
      },
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => <SortableHeader column={column}>Utworzono</SortableHeader>,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDateLong(row.original.createdAt)}</span>
      ),
    },
    {
      id: 'actions',
      enableHiding: false,
      size: 60,
      cell: ({ row }) => {
        const isSelf = row.original.id === me?.id;
        return (
          <div className="text-right">
            <RowActions
              onEdit={() => openEdit(row.original)}
              // Backend i tak odrzuca usuniecie wlasnego konta — nie kuszmy przyciskiem.
              onDelete={() =>
                isSelf
                  ? toast.error('Nie mozesz usunac wlasnego konta')
                  : setDeleting(row.original)
              }
            >
              {!isSelf && (
                <>
                  <DropdownMenuItem
                    onSelect={() => impersonateMutation.mutate(row.original.id)}
                    disabled={impersonateMutation.isPending}
                  >
                    <Eye />
                    Zobacz jako…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
            </RowActions>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Uzytkownicy"
        description="Konta i role. Administrator moze tez podejrzec system oczami wybranej osoby."
        actions={
          <Button onClick={openCreate}>
            <Plus />
            Dodaj konto
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={visible}
        isLoading={isPending}
        searchPlaceholder="Szukaj po nazwisku, e-mailu lub powiazaniu…"
        columnLabels={COLUMN_LABELS}
        toolbar={
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Rola" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie role</SelectItem>
              {ROLES.map((item) => (
                <SelectItem key={item} value={item}>
                  {ROLE_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        emptyState={
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShieldCheck />
              </EmptyMedia>
              <EmptyTitle>Brak kont</EmptyTitle>
              <EmptyDescription>Zaloz pierwsze konto, aby ktos mogl sie zalogowac.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edytuj konto' : 'Nowe konto'}</DialogTitle>
            <DialogDescription>
              Rola decyduje o tym, co uzytkownik widzi w menu — i jakie powiazanie trzeba wskazac.
            </DialogDescription>
          </DialogHeader>

          <form
            id="user-form"
            onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
            noValidate
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="name">Imie i nazwisko</FieldLabel>
                <Input
                  id="name"
                  aria-invalid={!!form.formState.errors.name}
                  {...form.register('name')}
                />
                <FieldError errors={[form.formState.errors.name]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="email">E-mail</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="j.kowalski@umg.edu.pl"
                  aria-invalid={!!form.formState.errors.email}
                  {...form.register('email')}
                />
                <FieldError errors={[form.formState.errors.email]} />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="password">
                    {editing ? 'Nowe haslo' : 'Haslo'}
                  </FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={!!form.formState.errors.password}
                    {...form.register('password')}
                  />
                  {editing && <FieldDescription>Puste pole = bez zmiany.</FieldDescription>}
                  <FieldError errors={[form.formState.errors.password]} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="role">Rola</FieldLabel>
                  <Controller
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="role">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((item) => (
                            <SelectItem key={item} value={item}>
                              {ROLE_LABELS[item]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
              </div>

              {role === 'INSTRUCTOR' && (
                <Field>
                  <FieldLabel htmlFor="instructorId">Powiazany prowadzacy</FieldLabel>
                  <Controller
                    control={form.control}
                    name="instructorId"
                    render={({ field }) => (
                      <Combobox
                        id="instructorId"
                        options={[
                          { value: NO_INSTRUCTOR, label: 'Bez powiazania' },
                          ...instructorOptions,
                        ]}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Wybierz prowadzacego"
                        searchPlaceholder="Szukaj po nazwisku lub e-mailu…"
                      />
                    )}
                  />
                  <FieldDescription>
                    Bez tego powiazania konto nie zobaczy wlasnego planu zajec.
                  </FieldDescription>
                </Field>
              )}

              {role === 'DEAN_OFFICE' && (
                <Field>
                  <FieldLabel htmlFor="facultyId">Wydzial</FieldLabel>
                  <Controller
                    control={form.control}
                    name="facultyId"
                    render={({ field }) => (
                      <Combobox
                        id="facultyId"
                        options={facultyOptions}
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        placeholder="Wybierz wydzial"
                        searchPlaceholder="Szukaj wydzialu…"
                      />
                    )}
                  />
                  <FieldDescription>
                    Konto dziekanatu widzi i generuje plan tylko dla tego wydzialu.
                  </FieldDescription>
                </Field>
              )}

              {role === 'STUDENT' && (
                <Field>
                  <FieldLabel htmlFor="studentGroupIds">Grupy studenckie</FieldLabel>
                  <Controller
                    control={form.control}
                    name="studentGroupIds"
                    render={({ field }) => (
                      <MultiCombobox
                        id="studentGroupIds"
                        options={groupOptions}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Wybierz grupy"
                        searchPlaceholder="Szukaj grupy…"
                      />
                    )}
                  />
                  <FieldDescription>
                    Student nalezy zwykle do kilku grup naraz: wykladowej, cwiczeniowej
                    i laboratoryjnej.
                  </FieldDescription>
                </Field>
              )}
            </FieldGroup>
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Anuluj
            </Button>
            <Button type="submit" form="user-form" disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Spinner />}
              {editing ? 'Zapisz zmiany' : 'Utworz konto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Usunac konto ${deleting?.name ?? ''}?`}
        description="Uzytkownik straci dostep do systemu. Powiazany prowadzacy i grupy zostaja nietkniete."
        isPending={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </>
  );
}
