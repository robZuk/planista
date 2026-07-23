import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { isNotFoundError, isForeignKeyError } from '../lib/prismaErrors';
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

export async function getAll(_req: Request, res: Response): Promise<void> {
  try {
    const data = await prisma.timeBlock.findMany({ orderBy: { order: 'asc' } });
    res.json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const { startTime } = req.body as { startTime?: string };
    if (!startTime || !isValidHour(startTime)) {
      res.status(400).json({ error: 'Pole startTime musi byc pelna godzina w formacie HH:00' });
      return;
    }

    const endTime = addOneHour(startTime);

    const createdId = await prisma.$transaction(async (tx) => {
      const clash = await tx.timeBlock.findFirst({ where: { startTime } });
      if (clash) {
        throw new Error('DUPLICATE_START_TIME');
      }
      const tempOrder = (await tx.timeBlock.count()) + 1000;
      const created = await tx.timeBlock.create({
        data: { startTime, endTime, label: blockLabel(startTime, endTime), order: tempOrder },
      });
      await recomputeOrder(tx);
      return created.id;
    });

    const data = await prisma.timeBlock.findUnique({ where: { id: createdId } });
    res.status(201).json({ data, message: 'Blok czasowy utworzony' });
  } catch (error) {
    if (error instanceof Error && error.message === 'DUPLICATE_START_TIME') {
      res.status(409).json({ error: 'Blok o tej godzinie startu juz istnieje' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const block = await tx.timeBlock.findUnique({
        where: { id: req.params.id },
        include: {
          _count: {
            select: { templateStarts: true, templateEnds: true, entryStarts: true, entryEnds: true },
          },
        },
      });
      if (!block) {
        throw new Error('NOT_FOUND');
      }
      const inUse =
        block._count.templateStarts > 0 ||
        block._count.templateEnds > 0 ||
        block._count.entryStarts > 0 ||
        block._count.entryEnds > 0;
      if (inUse) {
        throw new Error('IN_USE');
      }

      await tx.timeBlock.delete({ where: { id: req.params.id } });
      await recomputeOrder(tx);
    });

    res.json({ message: 'Blok czasowy usuniety' });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Blok czasowy nie znaleziony' });
      return;
    }
    if (error instanceof Error && error.message === 'IN_USE') {
      res.status(409).json({ error: 'Nie mozna usunac bloku uzywanego w planie zajec' });
      return;
    }
    if (isNotFoundError(error)) {
      res.status(404).json({ error: 'Blok czasowy nie znaleziony' });
      return;
    }
    if (isForeignKeyError(error)) {
      res.status(409).json({ error: 'Nie mozna usunac bloku — jest jeszcze uzywany' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Blad serwera' });
  }
}
