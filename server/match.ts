import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MatchRequest, MatchResult } from '../src/lib/types.ts';
import * as db from './db.ts';
import * as storage from './storage.ts';

// skills/ sits at the project root here, and beside the bundled function on Vercel.
const SKILL_DIR = join(
  [join(import.meta.dirname, 'skills'), join(import.meta.dirname, '..', 'skills')].find(existsSync) ?? '',
  'psykhe-case-study-curation',
);
const MODEL = 'claude-opus-5-5';

export class MatchError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** SKILL.md without its frontmatter, plus any reference files beside it. Read per request so edits apply at once. */
function loadSkill(): string {
  const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
  const refsDir = join(SKILL_DIR, 'references');
  const refs = existsSync(refsDir) ? readdirSync(refsDir).filter((f) => f.endsWith('.md')).sort() : [];
  const parts = [skill.trim()];
  for (const f of refs) parts.push(`<reference file="references/${f}">\n${readFileSync(join(refsDir, f), 'utf8').trim()}\n</reference>`);
  if (!refs.includes('taxonomy.md')) {
    parts.push(
      'Note: references/taxonomy.md has not been provided. Classify work type, product surface, sector and sector group using your own judgement, apply the P1-P3 and S1-S3 levels as sensibly as you can, and say under Gaps that the taxonomy file is missing.',
    );
  }
  return parts.join('\n\n');
}

// How the skill maps onto this app. Kept separate from SKILL.md so the skill stays portable.
const APP_NOTES = `You are running inside PSYKHE's Knowledge Pool web app, so the following applies on top of the skill above.

- The approved case study library is the <case_study_library> JSON in the user's message. That is the Knowledge Pool; you have access to it. Do not ask for an access route.
- You cannot open the underlying PDF or PPTX files here. Work from each case study's recorded fields (title, project type, sector, service line, year, challenge, approach, impact, tags, source files). If a case study's fields are too thin to classify it, list it under Gaps with its title rather than guessing.
- Naming permission is the "permission" field: "Named, approved" means named (permission recorded in the Knowledge Pool); "Anonymised only" or empty means masked; "Awaiting client" means masked and should be flagged; "Internal only" means ineligible.
- The library does not record approval for external use beyond that field, completion status or delivery team. Treat case studies as eligible unless marked "Internal only", and say once under Gaps that these are not recorded. Skip the team tie-breaker.
- <past_work> lists past proposals and project records. Never shortlist from it; use it only for "Relevant work with no approved case study".
- Use each case study's library title. The "client" field holds the real client name: show it only when the case study is named.
- Return the curation note in the JSON format requested, using the exact ids from the library. Put clause references in "clause" (a section number, or a short quoted phrase if unnumbered). If the skill tells you to stop and ask, set status to "needs_input", put the question in "question" and leave the lists empty.
- Fill "classifications" only for case studies you classified yourself.`;

const str = { type: 'string' };
const strs = { type: 'array', items: str };
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const RESULT_SCHEMA = obj({
  status: { type: 'string', enum: ['ok', 'needs_input'] },
  question: str,
  briefProfile: { type: 'array', items: obj({ label: str, value: str, clause: str }) },
  shortlist: {
    type: 'array',
    items: obj({
      rank: { type: 'integer' },
      caseStudyId: str,
      title: str,
      projectTypeMatch: { type: 'string', enum: ['P1', 'P2', 'P3'] },
      projectTypeReason: str,
      sectorMatch: { type: 'string', enum: ['S1', 'S2', 'S3'] },
      why: str,
      namingStatus: { type: 'string', enum: ['Named', 'Masked'] },
      flags: strs,
    }),
  },
  notShortlisted: { type: 'array', items: obj({ caseStudyId: str, title: str, reason: str }) },
  uncoveredWork: { type: 'array', items: obj({ itemId: str, title: str, why: str, recommendWriteUp: { type: 'boolean' } }) },
  gaps: strs,
  classifications: {
    type: 'array',
    items: obj({ caseStudyId: str, title: str, workType: str, surface: str, sector: str, year: str, status: str }),
  },
});

const TEXT_TYPES = /^text\/|^application\/(json|markdown)$/;

/** Turns a file into a content block Claude can read: PDFs as documents, text as text. */
function fileBlock(name: string, mime: string, data: Buffer): Anthropic.Beta.BetaContentBlockParam {
  const isPdf = mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    return {
      type: 'document',
      title: name,
      source: { type: 'base64', media_type: 'application/pdf', data: data.toString('base64') },
    };
  }
  if (TEXT_TYPES.test(mime) || /\.(txt|md)$/i.test(name)) {
    return { type: 'text', text: `<brief file="${name}">\n${data.toString('utf8')}\n</brief>` };
  }
  throw new MatchError(`“${name}” can’t be read here. Use a PDF or text file, or paste the brief’s text.`);
}

async function briefBlocks(req: MatchRequest): Promise<Anthropic.Beta.BetaContentBlockParam[]> {
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (req.itemId) {
    const item = await db.getItem(req.itemId);
    if (!item) throw new MatchError('That item is no longer in the knowledge pool.', 404);
    if (item.kind === 'context') {
      blocks.push({ type: 'text', text: `<brief title="${item.title}">\n${item.body ?? ''}\n</brief>` });
    } else {
      const data = await storage.read(`files/${item.id}/`);
      if (!data) throw new MatchError(`No file is stored for “${item.title}”.`, 404);
      blocks.push(fileBlock(item.name, item.mime ?? '', data));
    }
  }
  if (req.file?.blobPath) {
    // Uploaded to Blob just for this search; read it once, then delete it.
    if (!/^briefs\/[a-z0-9-]{1,64}\/$/i.test(req.file.blobPath)) throw new MatchError('Invalid brief upload.');
    const data = await storage.read(req.file.blobPath);
    await storage.remove(req.file.blobPath);
    if (!data) throw new MatchError('The uploaded brief couldn’t be found. Try uploading it again.', 404);
    blocks.push(fileBlock(req.file.name, req.file.mime, data));
  } else if (req.file?.data) {
    blocks.push(fileBlock(req.file.name, req.file.mime, Buffer.from(req.file.data, 'base64')));
  }
  if (req.text?.trim()) blocks.push({ type: 'text', text: `<brief>\n${req.text.trim()}\n</brief>` });
  if (!blocks.length) throw new MatchError('Add a brief: paste its text, upload a file or pick an RFP from the pool.');
  return blocks;
}

async function library() {
  const items = await db.listItems();
  const byId = new Map(items.map((i) => [i.id, i]));
  const caseStudies = (await db.listCaseStudies()).map((cs) => ({
    id: cs.id,
    title: cs.title,
    client: cs.client,
    year: cs.year,
    projectType: cs.projectType,
    sector: cs.sector,
    serviceLine: cs.serviceLine,
    permission: cs.permission,
    challenge: cs.challenge,
    approach: cs.approach,
    impact: cs.impact,
    tags: cs.tags,
    sourceFiles: cs.sourceIds.map((id) => byId.get(id)?.name).filter(Boolean),
  }));
  const pastWork = items
    .filter((i) => i.docType === 'Proposal' || i.docType === 'Past project')
    .map((i) => ({
      id: i.id,
      title: i.title,
      type: i.docType,
      client: i.client,
      year: i.year,
      projectType: i.projectType,
      sector: i.sector,
      serviceLine: i.serviceLine,
      outcome: i.outcome,
      tags: i.tags,
    }));
  return { caseStudies, pastWork };
}

export async function matchCaseStudies(req: MatchRequest): Promise<MatchResult> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new MatchError('Add your ANTHROPIC_API_KEY to the .env file in the project folder, then restart the server.', 503);
  }
  const brief = await briefBlocks(req);
  const { caseStudies, pastWork } = await library();
  const count = req.count && req.count > 0 ? `The user wants ${req.count} case studies.` : 'The user did not say how many case studies they want.';

  // Keys that aren't scoped to a workspace must name one on every request.
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
  const client = new Anthropic(workspace ? { defaultHeaders: { 'anthropic-workspace-id': workspace } } : {});
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: RESULT_SCHEMA } },
    system: [{ type: 'text', text: `${loadSkill()}\n\n${APP_NOTES}` }],
    messages: [
      {
        role: 'user',
        content: [
          ...brief,
          {
            type: 'text',
            text: `<case_study_library>\n${JSON.stringify(caseStudies, null, 1)}\n</case_study_library>\n\n<past_work>\n${JSON.stringify(pastWork, null, 1)}\n</past_work>\n\n${count} Find the case studies that best evidence this brief.`,
          },
        ],
      },
    ],
  });

  let message: Anthropic.Beta.BetaMessage;
  try {
    message = await stream.finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new MatchError('The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.', 503);
    if (e instanceof Anthropic.RateLimitError) throw new MatchError('Claude is busy right now. Try again in a minute.', 503);
    if (e instanceof Anthropic.BadRequestError) throw new MatchError(`Claude couldn’t read the request: ${e.message}`, 400);
    if (e instanceof Anthropic.APIError) throw new MatchError(`Claude returned an error (${e.status ?? 'network'}). Try again.`, 502);
    throw e;
  }

  if (message.stop_reason === 'refusal') throw new MatchError('Claude declined to process this brief.', 502);
  if (message.stop_reason === 'max_tokens') throw new MatchError('The answer was too long to finish. Try asking for fewer case studies.', 502);
  const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  try {
    return JSON.parse(text) as MatchResult;
  } catch {
    throw new MatchError('Claude’s answer couldn’t be read. Try again.', 502);
  }
}
