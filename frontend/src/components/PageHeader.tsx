import type { ReactNode } from 'react';

interface Props {
  title: string;
  description?: string;
  /** Przyciski akcji po prawej (np. "Dodaj wydzial"). */
  actions?: ReactNode;
}

/** Naglowek strony — ten sam rytm tytul/opis/akcje na kazdym widoku. */
export function PageHeader({ title, description, actions }: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
