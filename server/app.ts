import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { CaseStudy, PoolItem } from '../src/lib/types.ts';
import { missingTags } from '../src/lib/types.ts';
import { authRoutes, requireAuth } from './auth.ts';
import * as db from './db.ts';
import { MatchError, matchCaseStudies } from './match.ts';
import * as storage from './storage.ts';

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ID = /^[a-z0-9-]{1,64}$/i;

export const app = express();
// On Vercel, requests arrive through its proxy; trust it so cookies are marked secure and IPs are real.
if (process.env.VERCEL) app.set('trust proxy', true);

app.use('/api/auth', express.json({ limit: '10kb' }), authRoutes);
// Checked before the body parsers so signed-out requests can't send large bodies.
app.use('/api', requireAuth);
app.use(express.json({ limit: '2mb' }));

// Express 4 doesn't catch rejected promises, so async routes pass errors on through this.
const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) =>
    fn(req, res).catch(next);

function badRequest(res: Response, message: string) {
  res.status(400).json({ error: message });
}

app.param('id', (req, res, next, id: string) => {
  if (!ID.test(id)) return badRequest(res, 'Invalid id');
  next();
});

app.get('/api/config', (_req, res) => {
  res.json({ storage: storage.usesBlob ? 'blob' : 'local' });
});

// ---------- Knowledge-pool items ----------

app.get(
  '/api/items',
  wrap(async (_req, res) => {
    const [items, withFiles] = await Promise.all([db.listItems(), storage.itemsWithFiles()]);
    res.json(items.map((i) => ({ ...i, hasFile: withFiles.has(i.id) })));
  }),
);

app.post(
  '/api/items',
  wrap(async (req, res) => {
    const incoming = (Array.isArray(req.body) ? req.body : [req.body]) as PoolItem[];
    for (const item of incoming) {
      if (!item || !ID.test(item.id ?? '')) return badRequest(res, 'Each item needs a valid id');
      const missing = missingTags(item);
      if (missing.length) return badRequest(res, `“${item.title || item.name}” is missing: ${missing.join(', ')}`);
    }
    const now = new Date().toISOString();
    const saved = incoming.map((i) => ({ ...i, sample: false, addedAt: now }));
    for (const item of saved) {
      await db.putItem(item);
      await db.ensureCaseStudyFor(item);
    }
    res.status(201).json(saved);
  }),
);

app.patch(
  '/api/items/:id',
  wrap(async (req, res) => {
    const current = await db.getItem(req.params.id);
    if (!current) return res.status(404).json({ error: 'Not found' });
    const next: PoolItem = { ...current, ...req.body, id: current.id, addedAt: current.addedAt, sample: current.sample };
    const missing = missingTags(next);
    if (missing.length) return badRequest(res, `Missing required tags: ${missing.join(', ')}`);
    await db.putItem(next);
    await db.ensureCaseStudyFor(next);
    res.json(next);
  }),
);

app.delete(
  '/api/items/:id',
  wrap(async (req, res) => {
    await db.deleteItem(req.params.id);
    await storage.remove(`files/${req.params.id}/`);
    res.status(204).end();
  }),
);

// Local storage only: the request body is the file itself.
app.put(
  '/api/items/:id/file',
  wrap(async (req, res) => {
    if (storage.usesBlob) return badRequest(res, 'Upload files to Blob storage instead');
    if (!(await db.getItem(req.params.id))) return res.status(404).json({ error: 'Create the item first' });
    if (Number(req.headers['content-length'] ?? 0) > MAX_FILE_BYTES) return res.status(413).json({ error: 'Files are limited to 50 MB' });
    let bytes = 0;
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_FILE_BYTES) req.destroy(new Error('too large'));
    });
    try {
      await storage.saveLocal(req.params.id, req);
      res.status(204).end();
    } catch {
      await storage.remove(`files/${req.params.id}/`);
      if (!res.headersSent) res.status(413).json({ error: 'Upload failed or file over 50 MB' });
    }
  }),
);

// Blob storage only: hands the browser a short-lived token to upload one file directly.
app.post(
  '/api/blob/upload',
  wrap(async (req, res) => {
    if (!storage.usesBlob) return badRequest(res, 'Blob storage isn’t set up');
    const { handleUpload } = await import('@vercel/blob/client');
    const result = await handleUpload({
      request: req,
      body: req.body,
      onBeforeGenerateToken: async (pathname) => {
        const m = /^(files|briefs)\/([a-z0-9-]{1,64})\/[^/]+$/i.exec(pathname);
        if (!m) throw new Error('Invalid upload path');
        if (m[1] === 'files' && !(await db.getItem(m[2]))) throw new Error('Create the item first');
        return { maximumSizeInBytes: MAX_FILE_BYTES, addRandomSuffix: false, allowOverwrite: true };
      },
    });
    res.json(result);
  }),
);

app.get(
  '/api/items/:id/file',
  wrap(async (req, res) => {
    const item = await db.getItem(req.params.id);
    if (!item) return res.status(404).json({ error: 'No file for this item' });
    if (storage.usesBlob) {
      const url = await storage.downloadUrl(item.id);
      return url ? res.redirect(url) : res.status(404).json({ error: 'No file for this item' });
    }
    const path = storage.localPath(item.id);
    res.download(path, item.name, { headers: item.mime ? { 'Content-Type': item.mime } : undefined }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'No file for this item' });
    });
  }),
);

// ---------- Case studies ----------

app.get(
  '/api/case-studies',
  wrap(async (_req, res) => {
    res.json(await db.listCaseStudies());
  }),
);

app.put(
  '/api/case-studies/:id',
  wrap(async (req, res) => {
    const body = req.body as CaseStudy;
    if (!body?.title?.trim() || !body?.client?.trim()) return badRequest(res, 'A case study needs a title and client');
    const existing = await db.getCaseStudy(req.params.id);
    const cs: CaseStudy = { ...body, id: req.params.id, sample: existing?.sample ?? false, updatedAt: new Date().toISOString() };
    await db.putCaseStudy(cs);
    res.json(cs);
  }),
);

app.delete(
  '/api/case-studies/:id',
  wrap(async (req, res) => {
    await db.deleteCaseStudy(req.params.id);
    res.status(204).end();
  }),
);

// ---------- Case study matching ----------

app.post(
  '/api/match',
  wrap(async (req, res) => {
    try {
      res.json(await matchCaseStudies(req.body));
    } catch (e) {
      if (e instanceof MatchError) return res.status(e.status).json({ error: e.message });
      throw e;
    }
  }),
);

// ---------- Sample data ----------

app.post(
  '/api/samples/clear',
  wrap(async (_req, res) => {
    const ids = await db.clearSamples();
    await Promise.all(ids.map((id) => storage.remove(`files/${id}/`)));
    res.status(204).end();
  }),
);

export function handleErrors(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
}
