import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/AppError';
import { asyncHandler } from '../middleware/asyncHandler';
import { isValidHour, addOneHour, blockLabel } from '../lib/timeBlocks';

/**
 * Przelicza `order` wszystkich blokow na podstawie posortowanej godziny startu.
 * Dzieki temu `order` zawsze odzwierciedla rzeczywista kolejnosc w siatce —
 * admin nie musi recznie zarzadzac numeracja.
 *
 * `order` ma constraint @unique, wiec bezposrednie przepisanie na docelowe
 * wartosci mogloby chwilowo kolidowac z wartoscia innego (jeszcze nieprzeliczonego)
 * wiersza. Najpierw przenosimy wszystkie na unikalne wartosci ujemne (na pewno
 * wolne), potem ustawiamy docelowe. Przyjmuje `tx`, zeby dzialac w tej samej
 * transakcji co create/delete (atomowosc — bez tego nieudane przeliczenie
 * zostawia sierocy rekord z tymczasowym `order`).
 */
async function recomputeOrder(tx: Prisma.TransactionClient): Promise<void> {
  const blocks = await tx.timeBlock.findMany({ orderBy: { startTime: 'asc' } });
  for (const [i, b] of blocks.entries()) {
    await tx.timeBlock.update({ where: { id: b.id }, data: { order: -(i + 1) } });
  }
  for (const [i, b] of blocks.entries()) {
    await tx.timeBlock.update({ where: { id: b.id }, data: { order: i + 1 } });
  }
}

export const getAll = asyncHandler(async (_req, res) => {
  const data = await prisma.timeBlock.findMany({ orderBy: { order: 'asc' } });
  res.json({ data });
});

export const create = asyncHandler(async (req, res) => {
  const { startTime } = req.body as { startTime: string };
  // Format (pelna godzina HH:00) sprawdzamy tu — bardziej szczegolowo niz w schemacie.
  if (!isValidHour(startTime)) {
    throw new AppError(400, 'Pole startTime musi byc pelna godzina w formacie HH:00');
  }

  const endTime = addOneHour(startTime);

  // AppError rzucony w callbacku transakcji jest przez Prisme przepuszczany dalej
  // (ten sam obiekt) -> trafia do errorHandler jako 409.
  const createdId = await prisma.$transaction(async (tx) => {
    const clash = await tx.timeBlock.findFirst({ where: { startTime } });
    if (clash) throw new AppError(409, 'Blok o tej godzinie startu juz istnieje');
    const tempOrder = (await tx.timeBlock.count()) + 1000;
    const created = await tx.timeBlock.create({
      data: { startTime, endTime, label: blockLabel(startTime, endTime), order: tempOrder },
    });
    await recomputeOrder(tx);
    return created.id;
  });

  const data = await prisma.timeBlock.findUnique({ where: { id: createdId } });
  res.status(201).json({ data, message: 'Blok czasowy utworzony' });
});

export const remove = asyncHandler(async (req, res) => {
  await prisma.$transaction(async (tx) => {
    const block = await tx.timeBlock.findUnique({
      where: { id: req.params.id },
      include: {
        _count: {
          select: { templateStarts: true, templateEnds: true, entryStarts: true, entryEnds: true },
        },
      },
    });
    if (!block) throw new AppError(404, 'Blok czasowy nie znaleziony');
    const inUse =
      block._count.templateStarts > 0 ||
      block._count.templateEnds > 0 ||
      block._count.entryStarts > 0 ||
      block._count.entryEnds > 0;
    if (inUse) throw new AppError(409, 'Nie mozna usunac bloku uzywanego w planie zajec');

    await tx.timeBlock.delete({ where: { id: req.params.id } });
    await recomputeOrder(tx);
  });

  res.json({ message: 'Blok czasowy usuniety' });
});
