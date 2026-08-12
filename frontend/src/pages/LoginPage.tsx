import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, CalendarRange, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import { loginRequest } from '@/api/auth';
import { useAuthStore } from '@/store/authStore';
import { getErrorMessage } from '@/lib/errors';

/** Walidacja po stronie klienta — zanim w ogole ruszymy do backendu. */
const loginSchema = z.object({
  email: z.string().min(1, 'Podaj adres email').email('To nie wyglada na adres email'),
  password: z.string().min(1, 'Podaj haslo'),
});

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();
  const location = useLocation();

  // Dokad wrocic po zalogowaniu (jesli ProtectedRoute nas tu odeslal).
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: LoginValues) => loginRequest(values.email, values.password),
    onSuccess: (data) => {
      setAuth(data);
      toast.success(`Witaj, ${data.user.name}`);
      navigate(from, { replace: true });
    },
  });

  // Zalogowany uzytkownik nie ma po co ogladac formularza.
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Lewa kolumna: sam formularz */}
      <div className="flex items-center justify-center p-6 md:p-10">
        <Card className="w-full max-w-sm border-0 shadow-none sm:border sm:shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">Zaloguj sie</CardTitle>
            <CardDescription>Uzyj konta uczelnianego, zeby wejsc do systemu.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} noValidate>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    autoFocus
                    placeholder="admin@umg.edu.pl"
                    aria-invalid={!!form.formState.errors.email}
                    {...form.register('email')}
                  />
                  <FieldError errors={[form.formState.errors.email]} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="password">Haslo</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      aria-invalid={!!form.formState.errors.password}
                      {...form.register('password')}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        type="button"
                        size="icon-xs"
                        aria-label={showPassword ? 'Ukryj haslo' : 'Pokaz haslo'}
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        {showPassword ? <EyeOff /> : <Eye />}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                  <FieldError errors={[form.formState.errors.password]} />
                </Field>

                {mutation.isError && (
                  <Alert variant="destructive">
                    <AlertCircle />
                    <AlertTitle>{getErrorMessage(mutation.error)}</AlertTitle>
                  </Alert>
                )}

                <Field>
                  <Button type="submit" size="lg" disabled={mutation.isPending}>
                    {mutation.isPending && <Spinner />}
                    Zaloguj sie
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Prawa kolumna: panel marki — na waskich ekranach chowamy */}
      <div className="relative hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:p-12">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary-foreground/15">
            <CalendarRange className="size-5" />
          </div>
          <span className="font-heading text-xl font-semibold">Planista</span>
        </div>
        <div className="max-w-md lg:my-auto">
          <p className="font-heading text-3xl leading-tight font-semibold">
            Plan zajec, ktory uklada sie sam.
          </p>
          <p className="mt-4 text-primary-foreground/80">
            Siatki godzin, grupy, sale i terminy w jednym miejscu — z automatycznym wykrywaniem
            konfliktow.
          </p>
        </div>
      </div>
    </div>
  );
}
