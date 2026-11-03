import type { IncomingMessage, ServerResponse } from 'node:http';
import { app, handleErrors } from './app.ts';

// The Vercel function entry. scripts/build-vercel.mjs bundles this file; Vercel serves the
// built front end itself and sends /api/* here, with the original path in ?__path=.
app.use(handleErrors);

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x');
  const path = url.searchParams.get('__path');
  if (path !== null) {
    url.searchParams.delete('__path');
    req.url = `/api/${path}${url.search}`;
  }
  return app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
}
