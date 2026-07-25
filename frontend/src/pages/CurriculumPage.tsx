import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import { FacultySelector } from '@/components/FacultySelector';
import VersionsTab from './curriculum/VersionsTab';
import StructureTab from './curriculum/StructureTab';
import SubjectsTab from './curriculum/SubjectsTab';

/**
 * Siatka godzin ma trzy warstwy, ktore latwo pomylic, wiec siedza w osobnych zakladkach:
 *  - Siatki    — wersje programu (specjalnosc + rok + tryb) i ich przedmioty
 *  - Struktura — kierunki i nalezace do nich specjalnosci
 *  - Przedmioty— slownik przedmiotow wspolny dla calej uczelni
 */
export default function CurriculumPage() {
  const [tab, setTab] = useState('versions');

  return (
    <>
      <PageHeader
        title="Siatka godzin"
        description="Program studiow: co, w ktorym semestrze i w jakim wymiarze godzin."
      />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="versions">Siatki</TabsTrigger>
            <TabsTrigger value="structure">Kierunki i specjalnosci</TabsTrigger>
            <TabsTrigger value="subjects">Przedmioty</TabsTrigger>
          </TabsList>
          {/* Przedmioty sa wspolne dla calej uczelni (brak facultyId), wiec filtr tam nie pasuje. */}
          {tab !== 'subjects' && <FacultySelector />}
        </div>

        <TabsContent value="versions" className="mt-4">
          <VersionsTab />
        </TabsContent>
        <TabsContent value="structure" className="mt-4">
          <StructureTab />
        </TabsContent>
        <TabsContent value="subjects" className="mt-4">
          <SubjectsTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
