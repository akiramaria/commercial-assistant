import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app, handleErrors } from './app.ts';
import { location } from './db.ts';
import { usesBlob } from './storage.ts';

// Runs the app on this machine. On Vercel, server/vercel.ts is the entry instead.
// Not PORT: dev tooling often sets PORT for the Vite server, and the two must differ.
const PORT = Number(process.env.API_PORT ?? 3001);

// After npm run build, serve the built app too.
const dist = join(import.meta.dirname, '..', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(dist, 'index.html')));
}
app.use(handleErrors);

app.listen(PORT, async () => {
  console.log(`Knowledge pool API on http://localhost:${PORT} (data in ${await location()}, files in ${usesBlob ? 'Vercel Blob' : 'the data folder'})`);
});
