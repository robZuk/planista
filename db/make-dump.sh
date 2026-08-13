#!/usr/bin/env bash
# Odswieza db/planista7-dump.sql — zrzut bazy pozbawiony tokenow sesji
# i z haslami przestawionymi na te z backend/prisma/seed.ts.
#
# Czysci na KOPII bazy, zeby nie ruszyc `planista7`. Uzycie: bash db/make-dump.sh
set -euo pipefail

CONTAINER=planista-db-1
ZRODLO=planista7
KOPIA=planista7_public
KATALOG="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WYJSCIE="$KATALOG/planista7-dump.sql"

psql_kopia() { docker exec -i "$CONTAINER" psql -U postgres -d "$KOPIA" -v ON_ERROR_STOP=1 "$@"; }

sprzataj() {
  docker exec "$CONTAINER" psql -U postgres -d postgres \
    -c "DROP DATABASE IF EXISTS $KOPIA;" >/dev/null 2>&1 || true
}
trap sprzataj EXIT

# Hashe generujemy za kazdym razem od nowa (inna sol), zeby w repo nie siedziala
# na stale ta sama wartosc. Hasla czytamy z seed.ts, zeby nie rozjechaly sie z nim.
echo "==> generuje hashe hasel"
HASHE=$(cd "$KATALOG/../backend" && node -e "
const bcrypt = require('bcryptjs');
const konta = {
  'admin@umg.edu.pl':       'Admin1234!',
  'dziekanat@umg.edu.pl':   'Dziekanat1234!',
  'prowadzacy@umg.edu.pl':  'Prowadzacy1234!',
  'student@umg.edu.pl':     'Student1234!',
};
for (const [email, haslo] of Object.entries(konta)) {
  const hash = bcrypt.hashSync(haslo, 10).replace(/'/g, \"''\");
  console.log(\`UPDATE \\\"User\\\" SET password = '\${hash}' WHERE email = '\${email}';\`);
}")

echo "==> kopiuje $ZRODLO -> $KOPIA"
# TEMPLATE wymaga, zeby nikt nie byl podlaczony do zrodla — zatrzymaj backend, jesli zgrzyta.
docker exec "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS $KOPIA;" \
  -c "CREATE DATABASE $KOPIA TEMPLATE $ZRODLO;" >/dev/null

echo "==> czyszcze kopie"
psql_kopia >/dev/null <<SQL
BEGIN;
DELETE FROM "RefreshToken";
$HASHE
COMMIT;
SQL

# Kontrola przed zrzutem — obie musza przejsc, inaczej plik nie moze trafic do repo.
echo "==> sprawdzam"

# 1. Zaden token sesji nie przetrwal.
TOKENY=$(psql_kopia -At -c 'SELECT count(*) FROM "RefreshToken";')
[ "$TOKENY" = "0" ] || { echo "BLAD: zostalo $TOKENY tokenow odswiezania"; exit 1; }

# 2. Kazde konto dostalo nowe haslo. Konto spoza listy (np. dodane recznie)
#    UPDATE pomija, wiec niesie prawdziwy hash z bazy roboczej.
OBCE=$(psql_kopia -At <<'SQL'
SELECT count(*) FROM "User" WHERE email NOT IN (
  'admin@umg.edu.pl', 'dziekanat@umg.edu.pl',
  'prowadzacy@umg.edu.pl', 'student@umg.edu.pl');
SQL
)
[ "$OBCE" = "0" ] || {
  echo "BLAD: $OBCE kont spoza listy demonstracyjnej — ich hasel skrypt nie podmienil."
  echo "      Dopisz je do listy 'konta' powyzej albo usun z bazy przed zrzutem."
  exit 1
}

echo "==> zrzucam do $WYJSCIE"
docker exec "$CONTAINER" pg_dump -U postgres -d "$KOPIA" \
  --clean --if-exists --no-owner --no-privileges > "$WYJSCIE"

echo "gotowe: $(wc -c < "$WYJSCIE") bajtow"
