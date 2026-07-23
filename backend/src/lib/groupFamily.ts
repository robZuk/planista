import { prisma } from './prisma';

/**
 * Zwraca id calej "rodziny" grupy: sama grupa + wszyscy przodkowie + wszyscy potomkowie
 * (bez rodzenstwa). Uzywane przy wykrywaniu konfliktow — wyklad EDST-1-W i cwiczenia
 * EDST-1-C-A nie moga byc w tym samym czasie (studenci C-A chodza tez na wyklad),
 * ale EDST-1-C-A i EDST-1-C-B (rodzenstwo) juz moga.
 */
export async function getGroupFamilyIds(groupId: string): Promise<string[]> {
  const result: string[] = [groupId];

  // Przodkowie (w gore po parentGroupId).
  let curr = groupId;
  for (;;) {
    const g = await prisma.studentGroup.findUnique({
      where: { id: curr },
      select: { parentGroupId: true },
    });
    if (!g?.parentGroupId) break;
    result.push(g.parentGroupId);
    curr = g.parentGroupId;
  }

  // Potomkowie (w dol, BFS).
  const queue = [groupId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const children = await prisma.studentGroup.findMany({
      where: { parentGroupId: id },
      select: { id: true },
    });
    for (const c of children) {
      result.push(c.id);
      queue.push(c.id);
    }
  }

  return result;
}
