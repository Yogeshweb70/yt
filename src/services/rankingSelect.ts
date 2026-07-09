// Pure top-N distinct topic selection — no I/O, unit-tested in rankingSelect.test.ts.

export interface Scored {
  id: string;
  category: string | null;
  rank: number;
}

/**
 * Picks up to `n` topics, highest rank first, preferring one per category for
 * topical diversity, then backfilling by rank. Input need not be pre-sorted.
 */
export function pickDistinct(items: Scored[], n: number): string[] {
  const sorted = [...items].sort((a, b) => b.rank - a.rank);
  const picked: string[] = [];
  const used = new Set<string>();

  for (const it of sorted) {
    if (picked.length >= n) break;
    const cat = (it.category ?? "unknown").toLowerCase();
    if (used.has(cat)) continue;
    used.add(cat);
    picked.push(it.id);
  }
  for (const it of sorted) {
    if (picked.length >= n) break;
    if (!picked.includes(it.id)) picked.push(it.id);
  }
  return picked;
}
