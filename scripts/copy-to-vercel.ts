// One-off: copies the local knowledge pool (server/data) into the hosted Postgres database and Blob store.
// Put DATABASE_URL and BLOB_READ_WRITE_TOKEN from Vercel in .env.vercel, then run: npm run copy-to-vercel
// Safe to run again: records are overwritten by id and files replaced.
import { put } from '@vercel/blob';
import { existsSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import pg from 'pg';

const DATA_DIR = process.env.DATA_DIR ?? join(import.meta.dirname, '..', 'server', 'data');
const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url || !process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('Add DATABASE_URL and BLOB_READ_WRITE_TOKEN to .env.vercel first.');
  process.exit(1);
}

const local = new DatabaseSync(join(DATA_DIR, 'knowledge-pool.sqlite'), { readOnly: true });
const remote = new pg.Client({ connectionString: url });
await remote.connect();

await remote.query('CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, added_at TEXT NOT NULL, sample INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL)');
await remote.query('CREATE TABLE IF NOT EXISTS case_studies (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, sample INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL)');
await remote.query('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');

type Row = { id: string; at: string; sample: number; data: string };
const items = local.prepare('SELECT id, added_at AS at, sample, data FROM items').all() as Row[];
const caseStudies = local.prepare('SELECT id, updated_at AS at, sample, data FROM case_studies').all() as Row[];

for (const r of items) {
  await remote.query(
    'INSERT INTO items (id, added_at, sample, data) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET added_at = excluded.added_at, sample = excluded.sample, data = excluded.data',
    [r.id, r.at, r.sample, r.data],
  );
}
for (const r of caseStudies) {
  await remote.query(
    'INSERT INTO case_studies (id, updated_at, sample, data) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET updated_at = excluded.updated_at, sample = excluded.sample, data = excluded.data',
    [r.id, r.at, r.sample, r.data],
  );
}
console.log(`Copied ${items.length} items and ${caseStudies.length} case studies.`);

let files = 0;
for (const r of items) {
  const path = join(DATA_DIR, 'files', r.id);
  if (!existsSync(path)) continue;
  const item = JSON.parse(r.data) as { name: string; mime?: string };
  const name = item.name.replace(/[^\w.\- ()]+/g, '_').slice(-120) || 'file';
  const body = readFileSync(path);
  await put(`files/${r.id}/${name}`, body, {
    access: 'private',
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: item.mime || undefined,
    multipart: body.length > 8 * 1024 * 1024,
  });
  files++;
  console.log(`  uploaded ${item.name}`);
}
console.log(`Uploaded ${files} files.`);

await remote.end();
local.close();
