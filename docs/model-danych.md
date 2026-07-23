# Model danych — analiza i decyzje projektowe

Dokument referencyjny dla planista6. Opisuje, jak dane zachowują się w czasie,
oraz kluczowe decyzje modelowe (i ich uzasadnienie). Aktualizować przy zmianach schematu.

---

## 1. Temperatura danych (jak często się zmieniają)

Klasyfikacja wpływa na strategię cache'owania, indeksy, uprawnienia i to, co ląduje w seedzie.

### 🧊 Referencyjne / słownikowe — praktycznie stałe

Zmieniają się raz na lata, charakter strukturalny. Kandydaci do seeda i długiego cache'a.
Edycja: **tylko ADMIN**.

| Encja | Rytm zmian |
|---|---|
| `Faculty` (wydziały) | raz na lata |
| `FieldOfStudy` (kierunki) | rzadko |
| `Specialization` (specjalności) | rzadko |
| `Building` (budynki) | bardzo rzadko |
| `Room` (sale) | okazjonalnie |
| `Subject` (katalog przedmiotów) | powoli rośnie |
| `TimeBlock` (bloki czasowe) | ustawione raz, prawie nigdy |

### 🌡️ Konfiguracyjne — zmieniane cyklicznie (co rok / semestr)

Ustawiane raz na cykl, potem stabilne. Prawie wszystkie noszą pole `academicYear`.

| Encja | Rytm zmian | Uwaga |
|---|---|---|
| `CurriculumVersion` | co rok akademicki | wersjonowane — nowa wersja na rocznik |
| `CurriculumEntry` | przy układaniu siatki | dzieci wersji |
| `StudentGroup` | co rok akademicki | patrz §4 |
| `SemesterCalendar` | raz na semestr | ramy dat |
| `PublicHoliday` | raz na rok | dane kalendarzowe |
| `Instructor` | wolno (zatrudnienia/odejścia) | „master data" |

### 🔥 Operacyjne / transakcyjne — zmieniają się na bieżąco

Serce codziennej pracy. Wysoka rotacja → potrzebne indeksy i częsta inwalidacja cache.

| Encja | Zmienność | Dlaczego gorące |
|---|---|---|
| `ScheduleTemplate` | średnia | wzorzec planu, korekty w trakcie semestru |
| `ScheduleEntry` | **wysoka** | generowane hurtowo, potem codzienne odwołania/przeniesienia |
| `User` | średnia | nowe konta, zmiany haseł |
| `RefreshToken` | **najwyższa** | tworzony/kasowany przy każdym logowaniu; efemeryczny |

---

## 2. Linia podziału: czy encja ma `academicYear`?

- **Ma** (`CurriculumVersion`, `StudentGroup`, `ScheduleTemplate`, `SemesterCalendar`)
  → zależy od globalnego przełącznika rok/semestr w Sidebarze. Zmiana roku → inne dane.
- **Nie ma** (wydziały, budynki, sale, przedmioty, bloki, prowadzący)
  → niezależne od roku, wspólne dla całej uczelni.

Praktyczne skutki:
- **Cache:** referencyjne = długi `staleTime`; operacyjne (`ScheduleEntry`) = krótki `staleTime` + agresywna inwalidacja po każdej edycji planu.
- **Indeksy (Faza 6):** `ScheduleEntry` odpytywany po `date`, `roomId`, `instructorId`, `studentGroupId` — kandydaci na indeksy (najgorętsza tabela).
- **Uprawnienia:** referencyjne edytuje ADMIN; plan — także DEAN_OFFICE i częściowo INSTRUCTOR.
- **`RefreshToken`:** czyścić wygasłe, nie obejmować backupem.

---

## 3. Rok akademicki vs semestr

`academicYear` (`"2024/2025"`) to **cały rok akademicki** — obejmuje oba semestry. Semestr trzymany osobno, w dwóch znaczeniach:

- **`semester: Int` (1–7)** — numer semestru w toku studiów (`CurriculumEntry`, `ScheduleTemplate`).
- **`semesterType: WINTER | SUMMER`** — która połowa roku (`SemesterCalendar`).

Aby jednoznacznie wskazać okres nauczania, potrzeba **dwóch** informacji:
`academicYear` **+** `semester`/`semesterType`. Dlatego przełącznik w Sidebarze ma oba
(`"2024/2025|WINTER"`).

> Zasada: nigdy nie przechowujemy `semesterType` obok `semester` w tym samym wierszu — grozi niespójnością. Typ wyliczamy (patrz §5).

---

## 4. Grupy w czasie (bez kohorty)

**Decyzja:** brak osobnego bytu „kohorta". `StudentGroup` jest przypięta do
**`studyYear + academicYear`** (NIE do semestru).

- Klucz unikalny: `[name, academicYear]` (pole `semester` usunięte z grupy).
- Ta sama grupa obsługuje **oba semestry** danego roku — studentów przypisujemy raz na rok.
- Semestr należy do **planu** (`ScheduleTemplate`, `CurriculumEntry`), nie do grupy.
- **Grupy powstają nowe co rok akademicki**, nie co semestr. W kolejnym roku rocznik awansuje
  (`EDST-1-W` → `EDST-2-W`).

Zjawiska czasowe:
1. **Progresja** — co rok nowe wiersze grup z wyższym `studyYear`.
2. **Zmiana topologii** — rok 1–2: `specializationId = null` (wspólna grupa); od roku 3 podział na specjalności (`DUT-…`, `ZEEW-…`).
3. **Dryf składu** — `size` to migawka; realny skład (`members`, M:N z `User`) zmienia się przez skreślenia/wznowienia.

Świadomy kompromis: bez kohorty nie ma prostego „śledzenia rocznika przez cały tok studiów" —
ale aplikacja jest zorientowana na *układanie planu semestru*, więc to akceptowalne.

### Tworzenie grup (Faza 5): generator wspomagany + edycja

- Dziekanat podaje parametry (kierunek/spec, rok studiów, rok akademicki, tryb, liczba grup
  ćwiczeniowych, liczba podgrup lab., rozmiary).
- System generuje **całą rodzinę** grup z poprawnymi nazwami i hierarchią jednym działaniem.
- Potem możliwa ręczna edycja pojedynczych grup (wyjątki).
- Bez automatycznego rollovera na start (dodać tylko, jeśli okaże się potrzebny).

Konwencja nazw (prefix = `specialization.shortName` lub `fieldOfStudy.shortName`):

```
{PREFIX}-{rok}-W          wykład (jeden)
{PREFIX}-{rok}-C-A/B/...   ćwiczenia
{PREFIX}-{rok}-L-A1/A2/B1  laboratoria (dzieci ćwiczeń)
{PREFIX}-{rok}-P-A/B/...   projekt
{PREFIX}-{rok}-S-A/B/...   seminarium
```

---

## 5. Typ semestru — model odporny (Opcja B)

Zamiast zaszytego na sztywno „nieparzysty = zima" (które łamie się dla naboru lutowego):

- `CurriculumVersion.startSemesterType` (`WINTER` domyślnie) — typ semestru startowego programu.
  `WINTER` = nabór październikowy, `SUMMER` = nabór lutowy (np. część II stopnia).
- Typ kolejnych semestrów **wyliczany naprzemiennie** — `backend/src/lib/semester.ts`:
  - `semesterTypeOf(startType, semester)` — nieparzysty = jak start, parzysty = przeciwny,
  - `semesterNumbersOfType(start, target, total)` — odwrotność (numery danego typu),
  - `oppositeSemesterType(type)`.

Przykłady:

| start | totalSemesters | ZIMA | LATO |
|---|---|---|---|
| WINTER | 7 | 1,3,5,7 | 2,4,6 |
| WINTER | 12 | 1,3,5,7,9,11 | 2,4,6,8,10,12 |
| SUMMER | 4 | 2,4 | 1,3 |

**Więcej semestrów** działa automatycznie: długość to dane (`totalSemesters`), a reguła to `% 2`.

Reguła naprzemienności **nie jest edytowalna** (niezmiennik dziedziny — czyni nieprawidłowe
stany niereprezentowalnymi). Admin steruje wynikiem przez `startSemesterType` (Faza 4).

---

## 6. Bloki czasowe (siatka planu)

- `TimeBlock` — pierwszorzędna kategoria: siatka 1-godzinna **07:00–20:00** (13 bloków),
  zarządzalna przez admina (CRUD, Faza 3/4). Pola: `order`, `startTime`, `endTime`, `label`.
- Zajęcia wskazują **blok początkowy i końcowy** (`startBlockId`, `endBlockId`, zakres domknięty),
  nie luźne stringi godzin. Wyrównanie do pełnej godziny jest wymuszone strukturą.
- Zajęcie może zajmować kilka kolejnych bloków (2h = 8:00–10:00). Przesunięcia w drag&drop: co 1 blok.
- Konflikt czasu (Faza 6) = **nakładanie się przedziałów `order`** bloków (arytmetyka na liczbach).

---

## 7. Siatka godzin ↔ plan zajęć

**Siatka godzin (curriculum)** — `CurriculumVersion` → `CurriculumEntry`. Deklaruje CO trzeba
przeprowadzić (godziny W/C/L/P/S, ECTS, zaliczenie). Już **wersjonowana**.

**Plan zajęć** — dwie warstwy:
1. **Wzorzec tygodnia** (`ScheduleTemplate`) — projektowany powtarzalny tydzień (dni × bloki).
2. **Kalendarz semestru** (`ScheduleEntry`) — konkretne daty, generator rozwija wzorzec
   (pomija święta, respektuje `weekType`). Statusy: SCHEDULED / CANCELLED / MAKEUP.

### Sposób układania planu — decyzja: ręcznie + wsparcie

- **Wzorzec tygodnia** układany **ręcznie** (drag & drop w siatkę dni × bloki) z mocnym wsparciem:
  walidacja konfliktów na żywo (nakładanie bloków dla sali/prowadzącego/rodziny grup),
  kolorowanie wolnych/zajętych slotów, bilans pozostałych godzin.
- **Bez pełnego solvera** (odrzucony — problem NP-trudny, zbyt duży nakład). Auto-uzupełnianie
  pozostałych godzin można dołożyć później jako pomocnik.
- **Kalendarz** (`ScheduleEntry`) — **zawsze generowany automatycznie** z wzorca (pomija święta,
  respektuje `weekType`), potem ręczne korekty pojedynczych terminów (odwołaj/przenieś/odrób).

### Wersjonowanie planu — decyzja: Szkic → Opublikowany

- Plan zajęć jest z natury „jeden na semestr" (nie wiele wariantów), ale ma mieć lekki status
  **DRAFT → PUBLISHED** na poziomie okresu nauczania (rok + semestr + tryb).
- Studenci widzą **tylko opublikowane**; dziekanat układa szkic w spokoju.
- Bez pełnej historii wersji. Dokładne miejsce statusu (pole / mała encja) projektujemy przy
  Fazie 6/7, nie dodajemy spekulatywnie teraz.

### Połączenie „co już zaplanowane?" — decyzja: bilans pokrycia

- `ScheduleTemplate.curriculumEntryId` → `CurriculumEntry.hoursX`. Liczymy **wymagane vs zaplanowane**
  per przedmiot i typ zajęć (bilans pokrycia w widoku planu).
- **Zasada rozliczania: 1 blok = 1 godzina z siatki.** Np. wymaganie 30h = 30 bloko-godzin
  = wzorzec 2-blokowy „co tydzień" × 15 tygodni. Bez przeliczania 45/60 min.

Bilans pokazujemy **także w widoku siatki godzin** (Faza 4): każda komórka godzinowa jako
`zaplanowano/wymagane` z ✅ pełne / ⚠️ częściowe / ⛔ brak, pasek postępu per przedmiot,
zbiorczy bilans semestru (zaplanowano X/Y h, pozostało). Zakres: **selektor grupy w siatce** —
wybierasz grupę; W liczone dla grupy wykładowej, C/L dla wybranej grupy ćwicz./lab.
Widok zbiorczy całego rocznika — ewentualnie jako drugi tryb później.

---

## 8. Globalny przełącznik rok/semestr (bez konfliktów z filtrami)

Globalny kontekst w Sidebarze: **rok akademicki + typ semestru** (`academicYearStore`, Zustand,
persystowany). Model warstwowy zapobiega konfliktom z filtrami lokalnymi:

- **Global = zakres zbioru** (który rok/semestr), **filtry lokalne = zawężenie w zbiorze**
  (grupa, prowadzący, status). Różne wymiary → składają się, nie kolidują.
- **Jedno źródło prawdy na wymiar** — rok/semestr ustawia tylko globalny przełącznik; widoki go
  czytają, nigdy nie duplikują własnym dropdownem roku.
- **Relevance-gating** — na widokach niezależnych od roku (budynki, sale, prowadzący, przedmioty,
  bloki, użytkownicy) przełącznik ukryty/nieaktywny.
- **Numer semestru wyprowadzany** (semesterType + `startSemesterType`), nie osobny globalny kontroler.

Konsumpcja per widok:

| Widok | rok akad. | typ semestru | Filtry lokalne |
|---|---|---|---|
| Siatka godzin | ✅ | opcjonalnie (podświetla semestry) | specjalność, tryb, grupa |
| Plan zajęć | ✅ | ✅ | grupa, prowadzący, status |
| **Grupy** | ✅ | **➖ nieistotny** (grupy per rok) | kierunek/spec., rok studiów, typ |
| Referencyjne | ➖ ukryty | ➖ | własne (typ, budynek…) |

> ⚠️ Rozbieżność względem planista3: tam grupy były per semestr, więc semesterType je filtrował.
> W planista6 grupy są **per rok** → typ semestru NIE filtruje grup (widok grup słucha tylko roku).

---

## 9. TODO walidacje (do dopięcia w kolejnych fazach)

- **Faza 3/4:** `TimeBlock` w CRUD — wymuszać, że blok trwa 1h i nie nachodzi na inny.
- **Faza 4:** `semester <= CurriculumVersion.totalSemesters` przy wpisach siatki / wzorcach.
- **Faza 6:** indeksy na `ScheduleEntry` (`date`, `roomId`, `instructorId`, `studentGroupId`).
