import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GraduationCap } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fetchFieldsOfStudy } from '@/api/fieldsOfStudy';
import { useFacultyFilterStore } from '@/store/facultyStore';
import { useFieldFilterStore } from '@/store/fieldFilterStore';

/** Przelacznik kierunku, kaskadujacy od filtra wydzialu — pokazuje tylko kierunki wybranego wydzialu. */
export function FieldOfStudySelector() {
  const facultyId = useFacultyFilterStore((s) => s.facultyId);
  const { fieldOfStudyId, setFieldOfStudyId } = useFieldFilterStore();
  const { data: fields } = useQuery({
    queryKey: ['fields-of-study'],
    queryFn: () => fetchFieldsOfStudy(),
  });

  const options =
    facultyId === 'all' ? fields : fields?.filter((field) => field.facultyId === facultyId);

  // Gdy zmiana wydzialu wyzej w kaskadzie uniewazni wybrany kierunek, wracamy na "Wszystkie".
  useEffect(() => {
    if (fieldOfStudyId !== 'all' && options && !options.some((field) => field.id === fieldOfStudyId)) {
      setFieldOfStudyId('all');
    }
  }, [options, fieldOfStudyId, setFieldOfStudyId]);

  return (
    <Select value={fieldOfStudyId} onValueChange={setFieldOfStudyId}>
      <SelectTrigger className="w-56" aria-label="Kierunek">
        <GraduationCap className="size-4 text-muted-foreground" />
        <SelectValue placeholder="Kierunek" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Wszystkie kierunki</SelectItem>
        {options?.map((field) => (
          <SelectItem key={field.id} value={field.id}>
            {field.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
