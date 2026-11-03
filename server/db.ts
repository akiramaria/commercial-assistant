import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CaseStudy, PoolItem } from '../src/lib/types.ts';
import { seedCaseStudies, seedItems } from '../src/lib/seed.ts';

// Postgres when DATABASE_URL is set (Vercel + Neon), otherwise a local SQLite file.
const PG_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
export const DATA_DIR = process.env.DATA_DIR ?? join(import.meta.dirname, 'data');

type Row = Record<string, unknown>;
/** Runs one statement. SQL is written with `?` placeholders and in syntax both databases accept. */
type Query = (sql: string, params?: unknown[]) => Promise<Row[]>;

/** A hosting setting is missing; the message tells the person what to add. */
export class SetupError extends Error {}

async function connect(): Promise<{ query: Query; where: string }> {
  if (!PG_URL && process.env.VERCEL) {
    throw new SetupError('No database is connected. In Vercel, open the project’s Storage tab, connect Neon (Postgres), then redeploy.');
  }
  if (PG_URL) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: PG_URL, max: 5 });
    const query: Query = async (sql, params = []) => {
      let n = 0;
      const res = await pool.query(
        sql.replace(/\?/g, () => `$${++n}`),
        params,
      );
      return res.rows;
    };
    return { query, where: 'Postgres' };
  }
  const { DatabaseSync } = await import('node:sqlite');
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(join(DATA_DIR, 'knowledge-pool.sqlite'));
  db.exec('PRAGMA journal_mode = WAL');
  const query: Query = async (sql, params = []) => db.prepare(sql).all(...(params as (string | number | null)[])) as Row[];
  return { query, where: DATA_DIR };
}

// Records are stored as JSON documents so the API returns exactly the shapes the app uses.
// Columns alongside `data` exist for sorting and filtering on the server.
const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, added_at TEXT NOT NULL, sample INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS case_studies (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, sample INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
];

const conn = connect().then(async (c) => {
  for (const s of SCHEMA) await c.query(s);
  return c;
});
// Failures surface on each query instead; unhandled here, they would stop the server.
conn.catch(() => undefined);
const q: Query = async (sql, params) => (await conn).query(sql, params);

/** Where the data lives, for the startup log. */
export const location = async () => (await conn).where;

const parse = <T>(rows: Row[]) => rows.map((r) => JSON.parse(r.data as string) as T);

export async function listItems(): Promise<PoolItem[]> {
  return parse(await q('SELECT data FROM items ORDER BY added_at DESC'));
}

export async function getItem(id: string): Promise<PoolItem | undefined> {
  return parse<PoolItem>(await q('SELECT data FROM items WHERE id = ?', [id]))[0];
}

export async function putItem(item: PoolItem) {
  await q(
    'INSERT INTO items (id, added_at, sample, data) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET added_at = excluded.added_at, sample = excluded.sample, data = excluded.data',
    [item.id, item.addedAt, item.sample ? 1 : 0, JSON.stringify(item)],
  );
}

export async function deleteItem(id: string) {
  await q('DELETE FROM items WHERE id = ?', [id]);
  // Drop the item from any case study that cites it.
  for (const cs of await listCaseStudies()) {
    if (cs.sourceIds.includes(id)) await putCaseStudy({ ...cs, sourceIds: cs.sourceIds.filter((s) => s !== id) });
  }
}

export async function listCaseStudies(): Promise<CaseStudy[]> {
  return parse(await q('SELECT data FROM case_studies ORDER BY updated_at DESC'));
}

export async function getCaseStudy(id: string): Promise<CaseStudy | undefined> {
  return parse<CaseStudy>(await q('SELECT data FROM case_studies WHERE id = ?', [id]))[0];
}

export async function putCaseStudy(cs: CaseStudy) {
  await q(
    'INSERT INTO case_studies (id, updated_at, sample, data) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET updated_at = excluded.updated_at, sample = excluded.sample, data = excluded.data',
    [cs.id, cs.updatedAt, cs.sample ? 1 : 0, JSON.stringify(cs)],
  );
}

export async function deleteCaseStudy(id: string) {
  await q('DELETE FROM case_studies WHERE id = ?', [id]);
}

/**
 * A document saved with type "Case study" becomes a case-study record, with the
 * document as its source, unless a case study already cites it.
 */
export async function ensureCaseStudyFor(item: PoolItem): Promise<CaseStudy | undefined> {
  if (item.docType !== 'Case study') return undefined;
  if ((await listCaseStudies()).some((c) => c.sourceIds.includes(item.id))) return undefined;
  const cs: CaseStudy = {
    id: `cs-${item.id}`.slice(0, 64),
    title: item.title || item.name,
    client: item.client,
    year: item.year,
    projectType: item.projectType,
    sector: item.sector,
    serviceLine: item.serviceLine,
    permission: item.sensitive ? 'Anonymised only' : '',
    challenge: '',
    approach: '',
    impact: '',
    tags: item.tags,
    sourceIds: [item.id],
    updatedAt: new Date().toISOString(),
  };
  await putCaseStudy(cs);
  return cs;
}

/** Removes sample rows; returns the ids of removed items so their files can go too. */
export async function clearSamples(): Promise<string[]> {
  const ids = (await q('SELECT id FROM items WHERE sample = 1')).map((r) => r.id as string);
  await q('DELETE FROM items WHERE sample = 1');
  await q('DELETE FROM case_studies WHERE sample = 1');
  for (const cs of await listCaseStudies()) {
    const kept = cs.sourceIds.filter((s) => !ids.includes(s));
    if (kept.length !== cs.sourceIds.length) await putCaseStudy({ ...cs, sourceIds: kept });
  }
  return ids;
}

// A brand-new local database starts with the Figma sample rows. A hosted one starts
// empty and is filled by scripts/copy-to-vercel.ts.
if (!PG_URL && !process.env.VERCEL) {
  void (async () => {
    const claimed = await q("INSERT INTO meta (key, value) VALUES ('seeded', ?) ON CONFLICT (key) DO NOTHING RETURNING key", [new Date().toISOString()]);
    if (claimed.length) {
      for (const i of seedItems) await putItem(i);
      for (const c of seedCaseStudies) await putCaseStudy(c);
    }
    // Documents typed "Case study" before that rule existed still need their case-study record.
    for (const i of await listItems()) await ensureCaseStudyFor(i);
  })().catch((e) => console.error('Couldn’t prepare the local database:', e));
}
