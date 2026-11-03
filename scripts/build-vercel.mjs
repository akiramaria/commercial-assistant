// Packages the app for Vercel using its Build Output API (.vercel/output):
// the built front end as static files, and the Express API as one Node function.
// Run after `npm run build` (npm run build:vercel does both).
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const out = join(root, '.vercel', 'output');
const fn = join(out, 'functions', 'api.func');

rmSync(out, { recursive: true, force: true });
mkdirSync(fn, { recursive: true });

cpSync(join(root, 'dist'), join(out, 'static'), { recursive: true });

await build({
  entryPoints: [join(root, 'server', 'vercel.ts')],
  outfile: join(fn, 'index.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // pg tries to load an optional native driver; it isn't used.
  external: ['pg-native'],
  // Some bundled packages are CommonJS and call require().
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'warning',
});

// match.ts reads the skill at request time, so ship it beside the function.
cpSync(join(root, 'skills'), join(fn, 'skills'), { recursive: true });

writeFileSync(
  join(fn, '.vc-config.json'),
  JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      supportsResponseStreaming: true,
      // A case study search takes about a minute.
      maxDuration: 300,
    },
    null,
    2,
  ),
);

writeFileSync(
  join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/api/(.*)$', dest: '/api?__path=$1' },
        { handle: 'filesystem' },
        // The app routes with #hashes, but send any other path to it too.
        { src: '/.*', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);

console.log('Vercel output written to .vercel/output');
