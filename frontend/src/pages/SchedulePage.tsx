import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import PlaceholderPage from '@/pages/PlaceholderPage';
import TemplateTab from './schedule/TemplateTab';

/**
 * Plan zajec ma dwa poziomy, ktore latwo pomylic:
 *  - Wzorzec tygodnia — powtarzalny uklad ("wtorki 10:00, sala 101")
 *  - Kalendarz        — konkretne daty wygenerowane z wzorca, z odwolaniami i przeniesieniami
 */
export default function SchedulePage() {
  return (
    <>
      <PageHeader
        title="Plan zajec"
        description="Najpierw ulozy sie wzorzec tygodnia, potem generuje z niego terminy na caly semestr."
      />

      <Tabs defaultValue="template">
        <TabsList>
          <TabsTrigger value="template">Wzorzec tygodnia</TabsTrigger>
          <TabsTrigger value="calendar">Kalendarz semestru</TabsTrigger>
        </TabsList>

        <TabsContent value="template" className="mt-4">
          <TemplateTab />
        </TabsContent>
        <TabsContent value="calendar" className="mt-4">
          <PlaceholderPage title="Kalendarz semestru" phase={7} />
        </TabsContent>
      </Tabs>
    </>
  );
}
