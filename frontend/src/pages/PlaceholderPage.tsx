import { Construction } from 'lucide-react';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { PageHeader } from '@/components/PageHeader';

interface Props {
  title: string;
  /** Numer fazy, w ktorej ta strona powstanie. */
  phase: number;
}

/** Tymczasowa zawartosc tras, ktore czekaja na swoja faze. */
export default function PlaceholderPage({ title, phase }: Props) {
  return (
    <>
      <PageHeader title={title} />
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Construction />
          </EmptyMedia>
          <EmptyTitle>Ten widok powstanie w Fazie {phase}</EmptyTitle>
          <EmptyDescription>
            Trasa i uprawnienia juz dzialaja — brakuje jeszcze samej tresci.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </>
  );
}
