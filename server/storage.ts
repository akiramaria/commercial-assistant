import { createWriteStream, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DATA_DIR } from './db.ts';

// Uploaded files: private Vercel Blob storage when BLOB_READ_WRITE_TOKEN is set, otherwise a local folder.
// In Blob, an item's file lives at files/<item id>/<file name>; briefs sent for matching at briefs/<id>/<file name>.
export const usesBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
export const FILES_DIR = join(DATA_DIR, 'files');
// Vercel's disk is read-only, so there files only work once Blob storage is connected.
export const NO_BLOB_MESSAGE =
  'File storage isn’t connected. In Vercel, add BLOB_READ_WRITE_TOKEN under Settings → Environment Variables (Production), then redeploy.';
try {
  if (!usesBlob) mkdirSync(FILES_DIR, { recursive: true });
} catch {
  // Read-only disk (Vercel before Blob is connected): uploads fail with an error instead of crashing the server.
}

const blob = () => import('@vercel/blob');

async function blobAt(prefix: string) {
  const { list } = await blob();
  return (await list({ prefix, limit: 1 })).blobs[0];
}

/** Ids of every item that has a stored file. */
export async function itemsWithFiles(): Promise<Set<string>> {
  if (!usesBlob) return new Set(existsSync(FILES_DIR) ? readdirSync(FILES_DIR) : []);
  const { list } = await blob();
  const ids = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: 'files/', cursor, limit: 1000 });
    for (const b of page.blobs) ids.add(b.pathname.split('/')[1]);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return ids;
}

/** Saves a local upload (the request body). Blob uploads go straight from the browser instead. */
export async function saveLocal(id: string, body: Readable) {
  await pipeline(body, createWriteStream(join(FILES_DIR, id)));
}

/** A stored file's bytes, or undefined. `path` is a Blob pathname prefix such as files/<id>/. */
export async function read(path: string): Promise<Buffer | undefined> {
  if (!usesBlob) {
    const local = join(FILES_DIR, path.split('/')[1]);
    return existsSync(local) ? readFile(local) : undefined;
  }
  const found = await blobAt(path);
  if (!found) return undefined;
  const { get } = await blob();
  const res = await get(found.pathname, { access: 'private' });
  if (!res || res.statusCode !== 200) return undefined;
  return Buffer.from(await new Response(res.stream).arrayBuffer());
}

/** A short-lived link to download an item's file from Blob. */
export async function downloadUrl(id: string): Promise<string | undefined> {
  const found = await blobAt(`files/${id}/`);
  if (!found) return undefined;
  const { issueSignedToken, presignUrl } = await blob();
  const validUntil = Date.now() + 5 * 60 * 1000;
  const token = await issueSignedToken({ pathname: found.pathname, operations: ['get'], validUntil });
  return (await presignUrl(token, { operation: 'get', pathname: found.pathname, validUntil, access: 'private' })).presignedUrl;
}

/** Deletes everything stored under a prefix such as files/<id>/. */
export async function remove(path: string) {
  if (!usesBlob) return rm(join(FILES_DIR, path.split('/')[1]), { force: true });
  const { list, del } = await blob();
  const { blobs } = await list({ prefix: path });
  if (blobs.length) await del(blobs.map((b) => b.url));
}

export const localPath = (id: string) => join(FILES_DIR, id);
