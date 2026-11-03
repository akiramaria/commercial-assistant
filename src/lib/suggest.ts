import type { DocType, PoolItem } from './types';

/**
 * Suggests tags from a file name and from what is already in the pool.
 * There's no document-reading backend yet, so this is a heuristic, not AI.
 */
export function suggestTags(fileName: string, pool: PoolItem[]): Partial<PoolItem> {
  const lower = fileName.toLowerCase();
  const out: Partial<PoolItem> = {};

  const docType: DocType | undefined = /rfp|tender|request.for|\bitt\b|\brfq\b/.test(lower)
    ? 'RFP'
    : /closure|retro|lessons|post.?mortem|wrap.?up/.test(lower)
      ? 'Past project'
      : /case.?stud/.test(lower)
        ? 'Case study'
        : /proposal|pitch|\bsow\b|quote/.test(lower)
          ? 'Proposal'
          : /notes|\bbd\b|meeting/.test(lower)
            ? 'BD notes'
            : undefined;
  if (docType) out.docType = docType;

  const year = lower.match(/(20\d\d)/);
  if (year) out.year = year[1];

  // Match a known client when a distinctive word from its name appears in the file name.
  const clients = Array.from(new Set(pool.map((p) => p.client).filter(Boolean)));
  const client = clients.find((c) =>
    c
      .toLowerCase()
      .split(/\s+/)
      .some((w) => w.length >= 4 && lower.includes(w)),
  );
  if (client) {
    out.client = client;
    // Borrow sector / project type / service line from the most recent item for that client.
    const prior = pool
      .filter((p) => p.client === client)
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt))[0];
    if (prior) {
      if (prior.sector) out.sector = prior.sector;
      if (prior.projectType) out.projectType = prior.projectType;
      if (prior.serviceLine) out.serviceLine = prior.serviceLine;
    }
  }

  return out;
}

export function titleFromFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b20\d\d\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
