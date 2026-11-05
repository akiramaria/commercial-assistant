import type { MatchRequest, MatchResult } from '../src/lib/types.ts';
import { AIError, askClaude, fileBlock, loadSkill, obj, str, strs, type Block } from './claude.ts';
import * as db from './db.ts';
import * as storage from './storage.ts';


/** The case-study curation skill, with a note when its taxonomy reference is missing. */
function curationSkill(): string {
  const { text, refs } = loadSkill('psykhe-case-study-curation');
  if (refs.includes('taxonomy.md')) return text;
  return `${text}\n\nNote: references/taxonomy.md has not been provided. Classify work type, product surface, sector and sector group using your own judgement, apply the P1-P3 and S1-S3 levels as sensibly as you can, and say under Gaps that the taxonomy file is missing.`;
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

async function briefBlocks(req: MatchRequest): Promise<Block[]> {
  const blocks: Block[] = [];
  if (req.itemId) {
    const item = await db.getItem(req.itemId);
    if (!item) throw new AIError('That item is no longer in the knowledge pool.', 404);
    if (item.kind === 'context') {
      blocks.push({ type: 'text', text: `<brief title="${item.title}">\n${item.body ?? ''}\n</brief>` });
    } else {
      const data = await storage.read(`files/${item.id}/`);
      if (!data) throw new AIError(`No file is stored for “${item.title}”.`, 404);
      blocks.push(await fileBlock(item.name, item.mime ?? '', data, 'brief'));
    }
  }
  if (req.file?.blobPath) {
    // Uploaded to Blob just for this search; read it once, then delete it.
    if (!/^briefs\/[a-z0-9-]{1,64}\/$/i.test(req.file.blobPath)) throw new AIError('Invalid brief upload.');
    const data = await storage.read(req.file.blobPath);
    await storage.remove(req.file.blobPath);
    if (!data) throw new AIError('The uploaded brief couldn’t be found. Try uploading it again.', 404);
    blocks.push(await fileBlock(req.file.name, req.file.mime, data, 'brief'));
  } else if (req.file?.data) {
    blocks.push(await fileBlock(req.file.name, req.file.mime, Buffer.from(req.file.data, 'base64'), 'brief'));
  }
  if (req.text?.trim()) blocks.push({ type: 'text', text: `<brief>\n${req.text.trim()}\n</brief>` });
  if (!blocks.length) throw new AIError('Add a brief: paste its text, upload a file or pick an RFP from the pool.');
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
  const brief = await briefBlocks(req);
  const { caseStudies, pastWork } = await library();
  const count = req.count && req.count > 0 ? `The user wants ${req.count} case studies.` : 'The user did not say how many case studies they want.';
  return askClaude<MatchResult>({
    system: `${curationSkill()}\n\n${APP_NOTES}`,
    schema: RESULT_SCHEMA,
    tooLong: 'The answer was too long to finish. Try asking for fewer case studies.',
    content: [
      ...brief,
      {
        type: 'text',
        text: `<case_study_library>\n${JSON.stringify(caseStudies, null, 1)}\n</case_study_library>\n\n<past_work>\n${JSON.stringify(pastWork, null, 1)}\n</past_work>\n\n${count} Find the case studies that best evidence this brief.`,
      },
    ],
  });
}
