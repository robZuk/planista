import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Eye, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ROLE_LABELS } from '@/lib/navigation';
import { useAuthStore } from '@/store/authStore';

/**
 * Pasek widoczny tylko w trakcie podgladu cudzego konta.
 *
 * Musi byc nachalny — bez niego admin po kilku klikach zapomina, ze patrzy
 * cudzymi oczami, i zglasza "brakujace" strony, ktorych po prostu nie widzi
 * dana rola. Stad zolte tlo i staly przycisk powrotu.
 */
export function ImpersonationBanner() {
  const user = useAuthStore((s) => s.user);
  const originalAuth = useAuthStore((s) => s.originalAuth);
  const stopImpersonating = useAuthStore((s) => s.stopImpersonating);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  if (!originalAuth || !user) return null;

  const onReturn = () => {
    stopImpersonating();
    // Cache nalezy do podgladanego konta — po powrocie do admina musi zniknac.
    queryClient.clear();
    navigate('/', { replace: true });
    toast.success(`Powrot do konta ${originalAuth.user.name}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm">
      <Eye className="size-4 shrink-0" />
      <span>
        Podglad jako <strong>{user.name}</strong> ({ROLE_LABELS[user.role]}). Widzisz system tak,
        jak ta osoba.
      </span>
      <Button size="sm" variant="outline" className="ml-auto bg-background" onClick={onReturn}>
        <Undo2 />
        Wroc do konta {originalAuth.user.name}
      </Button>
    </div>
  );
}
