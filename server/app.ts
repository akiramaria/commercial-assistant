import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { CaseStudy, PoolItem, Proposal } from '../src/lib/types.ts';
import { missingTags } from '../src/lib/types.ts';
import { authRoutes, requireAuth } from './auth.ts';
import * as db from './db.ts';
import { AIError } from './claude.ts';
import { matchCaseStudies } from './match.ts';
import { runStep } from './proposals.ts';
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

for (const name of ['id', 'fileId']) {
  app.param(name, (req, res, next, id: string) => {
    if (!ID.test(id)) return badRequest(res, 'Invalid id');
    next();
  });
}

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
        const m = /^(files|briefs|sources)\/([a-z0-9-]{1,64})\/[^/]+$/i.exec(pathname);
        if (!m) throw new Error('Invalid upload path');
        if (m[1] === 'files' && !(await db.getItem(m[2]))) throw new Error('Create the item first');
        if (m[1] === 'sources' && !(await proposalWithSource(m[2]))) throw new Error('Add the file to a proposal first');
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

// ---------- Proposals ----------

const proposalWithSource = async (fileId: string) => (await db.listProposals()).find((p) => p.sources.some((s) => s.id === fileId));

app.get(
  '/api/proposals',
  wrap(async (_req, res) => {
    res.json(await db.listProposals());
  }),
);

app.get(
  '/api/proposals/:id',
  wrap(async (req, res) => {
    const p = await db.getProposal(req.params.id);
    return p ? res.json(p) : res.status(404).json({ error: 'That proposal no longer exists.' });
  }),
);

// Saves the whole proposal as the page holds it. The server owns runId and runStartedAt.
app.put(
  '/api/proposals/:id',
  wrap(async (req, res) => {
    const body = req.body as Proposal;
    if (!body || typeof body.title !== 'string' || !Array.isArray(body.sources)) return badRequest(res, 'Invalid proposal');
    if (body.sources.some((s) => !ID.test(s.id ?? ''))) return badRequest(res, 'Invalid file id');
    const existing = await db.getProposal(req.params.id);
    // Leaving a run (cancel, or going back) drops its id, so its result is ignored when it finishes.
    const running = existing?.runId && body.step === existing.step;
    const p: Proposal = {
      ...body,
      id: req.params.id,
      runId: running ? existing.runId : undefined,
      runStartedAt: running ? existing.runStartedAt : undefined,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.putProposal(p);
    // Files removed from the proposal are deleted from storage too.
    const kept = new Set(p.sources.map((s) => s.id));
    await Promise.all((existing?.sources ?? []).filter((s) => !kept.has(s.id)).map((s) => storage.remove(`sources/${s.id}/`)));
    res.json(p);
  }),
);

app.delete(
  '/api/proposals/:id',
  wrap(async (req, res) => {
    const p = await db.getProposal(req.params.id);
    await db.deleteProposal(req.params.id);
    await Promise.all((p?.sources ?? []).map((s) => storage.remove(`sources/${s.id}/`)));
    res.status(204).end();
  }),
);

// Local storage only: the request body is the file itself. The file must already be listed on the proposal.
app.put(
  '/api/proposals/:id/sources/:fileId',
  wrap(async (req, res) => {
    if (storage.usesBlob) return badRequest(res, 'Upload files to Blob storage instead');
    const p = await db.getProposal(req.params.id);
    if (!p?.sources.some((s) => s.id === req.params.fileId)) return res.status(404).json({ error: 'Add the file to the proposal first' });
    if (Number(req.headers['content-length'] ?? 0) > MAX_FILE_BYTES) return res.status(413).json({ error: 'Files are limited to 50 MB' });
    try {
      await storage.saveLocal(req.params.fileId, req);
      res.status(204).end();
    } catch {
      await storage.remove(`sources/${req.params.fileId}/`);
      if (!res.headersSent) res.status(413).json({ error: 'Upload failed' });
    }
  }),
);

// Reads the sources (step 2) or finds gaps and assumptions (step 3). Takes a minute or two.
for (const kind of ['analyse', 'gaps'] as const) {
  app.post(
    `/api/proposals/:id/${kind}`,
    wrap(async (req, res) => {
      try {
        res.json(await runStep(req.params.id, kind));
      } catch (e) {
        if (e instanceof AIError) return res.status(e.status).json({ error: e.message });
        throw e;
      }
    }),
  );
}

// ---------- Case study matching ----------

app.post(
  '/api/match',
  wrap(async (req, res) => {
    try {
      res.json(await matchCaseStudies(req.body));
    } catch (e) {
      if (e instanceof AIError) return res.status(e.status).json({ error: e.message });
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
  if (err instanceof db.SetupError) return res.status(503).json({ error: err.message });
  res.status(500).json({ error: 'Something went wrong on the server' });
}
