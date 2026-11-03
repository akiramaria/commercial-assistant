# Commercial Assistant — Knowledge pool

Upload past proposals, closure reports, RFPs and notes, tag them, and curate case studies from them.

Needs Node 24 or later (it uses the built-in `node:sqlite` and runs the server's TypeScript directly).

```bash
npm install
npm run dev      # API on :3001 and the app on http://localhost:5173
```

For a single production server:

```bash
npm run build
npm start        # serves the API and the built app on http://localhost:3001
```

## Where data lives

On this machine:

- `server/data/knowledge-pool.sqlite`: items and case studies
- `server/data/files/`: uploaded files, one per item id

On Vercel, items and case studies are in Postgres (Neon) and files are private in Vercel Blob. The server picks this up from
`DATABASE_URL` and `BLOB_READ_WRITE_TOKEN`; without them it uses the local folder. See [Deploy to Vercel](#deploy-to-vercel).

Back up the whole `server/data` folder. Set `DATA_DIR` to keep it somewhere else and `API_PORT` to change the port.
A new database starts with the sample rows from the Figma screens; "Remove sample data" in the table footer clears them.

## Sign-in

Every page and `/api` route needs a signed-in session. There is one account, set in `.env`:
`AUTH_EMAIL`, `AUTH_PASSWORD_HASH` (scrypt `salt:hash`; `.env.example` has the command that makes it) and `SESSION_SECRET`.
Restart the server after changing them. A session lasts 12 hours or until the browser closes;
10 wrong passwords from one address lock it out for 15 minutes.

## Skills

`skills/` holds the Claude Skills the app uses. `skills/psykhe-case-study-curation/SKILL.md` sets the rules for matching a brief or RFP to case studies in the Knowledge Pool (**Find case studies for a brief**, `server/match.ts`). Edit that file to change the rules; the next search picks them up. Put reference files such as `taxonomy.md` in `skills/psykhe-case-study-curation/references/` and they are sent too.

Matching calls Claude, so it needs an API key: copy `.env.example` to `.env`, add your key from console.anthropic.com and restart `npm run dev`. Each search sends the brief and a summary of every case study to Anthropic.

## Deploy to Vercel

`npm run build:vercel` builds the app and packages it in `.vercel/output`: the front end as static files and the API
(`server/vercel.ts`) as one function with up to 5 minutes per request. `vercel.json` tells Vercel to use that command.
Uploads go from the browser straight to Blob, because Vercel functions accept only about 4.5 MB per request.

1. **Put the project on GitHub.** `.env`, `.env.vercel`, `server/data` and `.vercel` are ignored, so keys and client files stay out of it.
2. **Import it in Vercel:** Add New → Project → pick the repository. Leave the framework as "Other" and don't deploy yet.
3. **Add storage** in the project's Storage tab:
   - **Neon** (Postgres). Connect it to the project; it adds `DATABASE_URL`.
   - **Blob**, with access set to **Private**. Connect it; it adds `BLOB_READ_WRITE_TOKEN`.
4. **Add the other settings** in Settings → Environment Variables, copying each value from your `.env`:
   `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID`, `AUTH_EMAIL`, `AUTH_PASSWORD_HASH`, `SESSION_SECRET`.
5. **Deploy** (Deployments → Redeploy, or push to GitHub).
6. **Copy your existing knowledge pool across.** Create `.env.vercel` in the project folder with the `DATABASE_URL` and
   `BLOB_READ_WRITE_TOKEN` values from Vercel (Storage → each store → `.env.local` tab), then run:

   ```bash
   npm run copy-to-vercel
   ```

   It copies every item, case study and file from `server/data`. Running it again overwrites by id, so it is safe to repeat.
   Delete `.env.vercel` afterwards.

A hosted database starts empty (no sample rows). Each case study search needs the function to run for about a minute;
check your Vercel plan allows that.
