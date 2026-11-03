import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';

// One account for now, set in .env. AUTH_PASSWORD_HASH is "salt:hash" from scrypt (see README).
const COOKIE = 'ca_session';
const SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

// Without a SESSION_SECRET, sessions only last until the server restarts.
const secret = process.env.SESSION_SECRET || randomBytes(32).toString('hex');

const sign = (payload: string) => createHmac('sha256', secret).update(payload).digest('base64url');

function safeEqual(a: string | Buffer, b: string | Buffer) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function passwordMatches(password: string) {
  const [salt, hash] = (process.env.AUTH_PASSWORD_HASH ?? '').split(':');
  if (!salt || !hash) return false;
  return safeEqual(scryptSync(password, salt, 64), Buffer.from(hash, 'hex'));
}

function readCookie(req: Request, name: string) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/** The signed-in email, or null. The cookie is "email|expiry|signature". */
function sessionUser(req: Request): string | null {
  const raw = readCookie(req, COOKIE);
  if (!raw) return null;
  const [email, expires, sig] = raw.split('|');
  if (!email || !expires || !sig || !safeEqual(sig, sign(`${email}|${expires}`))) return null;
  if (Number(expires) < Date.now() || email !== process.env.AUTH_EMAIL) return null;
  return email;
}

// Failed sign-ins per IP, to slow down password guessing.
const failures = new Map<string, { count: number; since: number }>();

export const authRoutes = Router();

authRoutes.get('/me', (req, res) => {
  const email = sessionUser(req);
  if (!email) return res.status(401).json({ error: 'Not signed in' });
  res.json({ email });
});

authRoutes.post('/login', (req, res) => {
  if (!process.env.AUTH_EMAIL || !process.env.AUTH_PASSWORD_HASH) {
    return res.status(503).json({ error: 'Sign-in isn’t set up on this server. Add AUTH_EMAIL and AUTH_PASSWORD_HASH to .env.' });
  }
  const ip = req.ip ?? 'unknown';
  const f = failures.get(ip);
  if (f && Date.now() - f.since < FAILURE_WINDOW_MS && f.count >= MAX_FAILURES) {
    return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  }

  const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
  const ok = typeof email === 'string' && typeof password === 'string' && safeEqual(email.trim().toLowerCase(), process.env.AUTH_EMAIL.toLowerCase()) && passwordMatches(password);
  if (!ok) {
    const fresh = !f || Date.now() - f.since >= FAILURE_WINDOW_MS;
    failures.set(ip, { count: fresh ? 1 : f.count + 1, since: fresh ? Date.now() : f.since });
    return res.status(401).json({ error: 'That email and password don’t match.' });
  }

  failures.delete(ip);
  const user = process.env.AUTH_EMAIL;
  const expires = Date.now() + SESSION_MS;
  // No maxAge, so the cookie also ends when the browser closes.
  res.cookie(COOKIE, `${user}|${expires}|${sign(`${user}|${expires}`)}`, { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/' });
  res.json({ email: user });
});

authRoutes.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.status(204).end();
});

/** Blocks every other /api route unless signed in. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!sessionUser(req)) return res.status(401).json({ error: 'Not signed in' });
  next();
}
