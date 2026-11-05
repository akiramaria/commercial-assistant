import { randomUUID } from 'node:crypto';
import { ENGAGEMENT_MODELS, PROJECT_TYPES, SECTORS } from '../src/lib/options.ts';
import type { Assumption, AssumptionSource, GapQuestion, Proposal, ProposalAnalysis } from '../src/lib/types.ts';
import { AIError, arr, askClaude, fileBlock, int, loadSkill, obj, str, type Block } from './claude.ts';
import * as db from './db.ts';
import * as storage from './storage.ts';

// The two Claude steps of creating a proposal: reading the brief (task 1 of skills/proposal-brief)
// and finding gaps and assumptions (task 2).

const point = obj({ label: str, text: str, source: str });

const ANALYSIS_SCHEMA = obj({
  headline: str,
  summary: arr(point),
  requirements: arr(point),
  projectType: { type: 'string', enum: PROJECT_TYPES },
  sector: { type: 'string', enum: SECTORS },
  engagementModel: { type: 'string', enum: ENGAGEMENT_MODELS },
  approachNote: str,
  similarProposals: arr(obj({ itemId: str, match: int, why: str })),
  caseStudies: arr(obj({ caseStudyId: str, match: int, why: str })),
});

const SOURCES: AssumptionSource[] = ['Template', 'Past proposal', 'AI suggested'];
const GAPS_SCHEMA = obj({
  questions: arr(obj({ question: str, why: str, placeholder: str })),
  assumptions: arr(obj({ text: str, source: { type: 'string', enum: SOURCES } })),
});

/** The proposal's files and notes as content blocks. Logos are images for the deck, not sources to read. */
async function sourceBlocks(p: Proposal): Promise<Block[]> {
  const blocks: Block[] = [];
  for (const s of p.sources.filter((s) => s.group !== 'logo')) {
    const data = await storage.read(`sources/${s.id}/`);
    if (!data) throw new AIError(`“${s.name}” is missing from storage. Remove it and upload it again.`, 404);
    blocks.push({ type: 'text', text: `The next source is “${s.name}”, tagged ${s.tag}.` });
    blocks.push(await fileBlock(s.name, s.mime, data));
  }
  if (p.notes.trim()) blocks.push({ type: 'text', text: `<bd_notes>\n${p.notes.trim()}\n</bd_notes>` });
  if (!blocks.length) throw new AIError('Add the RFP or brief, or paste some notes, before analysing.');
  return blocks;
}

function opportunity(p: Proposal) {
  return {
    title: p.title,
    client: p.client,
    submissionDeadline: p.deadline,
    serviceLine: p.serviceLine,
    clientNeeds: p.need === 'pricing' ? 'Quick pricing only: a price for a third quote, no deck' : 'Full proposal: scope, timeline, budget and a drafted deck',
    hubspotDeal: p.hubspotDeal,
  };
}

async function library() {
  const [items, caseStudies] = await Promise.all([db.listItems(), db.listCaseStudies()]);
  const pastProposals = items
    .filter((i) => i.docType === 'Proposal' || i.docType === 'Past project')
    .map(({ id, title, docType, client, year, projectType, sector, serviceLine, outcome, engagementModel, fee, tags }) => ({
      id,
      title,
      type: docType,
      client,
      year,
      projectType,
      sector,
      serviceLine,
      outcome,
      engagementModel,
      fee,
      tags,
    }));
  const cases = caseStudies.map(({ id, title, client, year, projectType, sector, serviceLine, permission, challenge, approach, impact, tags }) => ({
    id,
    title,
    client,
    year,
    projectType,
    sector,
    serviceLine,
    permission,
    challenge,
    approach,
    impact,
    tags,
  }));
  return { pastProposals, cases };
}

export async function analyse(p: Proposal): Promise<ProposalAnalysis> {
  const [sources, { pastProposals, cases }] = await Promise.all([sourceBlocks(p), library()]);
  const result = await askClaude<ProposalAnalysis>({
    system: loadSkill('proposal-brief').text,
    schema: ANALYSIS_SCHEMA,
    content: [
      ...sources,
      {
        type: 'text',
        text: [
          `<opportunity>\n${JSON.stringify(opportunity(p), null, 1)}\n</opportunity>`,
          `<allowed_values>\nProject types: ${PROJECT_TYPES.join(', ')}\nSectors: ${SECTORS.join(', ')}\nEngagement models: ${ENGAGEMENT_MODELS.join(', ')}\n</allowed_values>`,
          `<knowledge_pool_past_proposals>\n${JSON.stringify(pastProposals, null, 1)}\n</knowledge_pool_past_proposals>`,
          `<knowledge_pool_case_studies>\n${JSON.stringify(cases, null, 1)}\n</knowledge_pool_case_studies>`,
          'Do task 1: read the brief.',
        ].join('\n\n'),
      },
    ],
  });
  // Keep only references that exist, so the page never shows a match it can't open.
  const itemIds = new Set(pastProposals.map((i) => i.id));
  const caseIds = new Set(cases.map((c) => c.id));
  return {
    ...result,
    similarProposals: result.similarProposals.filter((s) => itemIds.has(s.itemId)),
    caseStudies: result.caseStudies.filter((c) => caseIds.has(c.caseStudyId)),
  };
}

export async function findGaps(p: Proposal): Promise<{ questions: GapQuestion[]; assumptions: Assumption[] }> {
  const [sources, items, caseStudies] = await Promise.all([sourceBlocks(p), db.listItems(), db.listCaseStudies()]);
  const references = items.filter((i) => p.references.includes(i.id));
  const keptCases = caseStudies.filter((c) => p.caseStudyRefs.includes(c.id));
  const skill = loadSkill('proposal-brief');
  const result = await askClaude<{ questions: Omit<GapQuestion, 'id' | 'mode' | 'answer'>[]; assumptions: Omit<Assumption, 'id'>[] }>({
    system: skill.text + (skill.refs.length ? '' : '\n\nNo assumptions template has been provided, so don’t tag anything "Template".'),
    schema: GAPS_SCHEMA,
    content: [
      ...sources,
      {
        type: 'text',
        text: [
          `<opportunity>\n${JSON.stringify(opportunity(p), null, 1)}\n</opportunity>`,
          `<confirmed_brief>\n${JSON.stringify(p.analysis?.summary ?? [], null, 1)}\n</confirmed_brief>`,
          `<requirements>\n${JSON.stringify(p.analysis?.requirements ?? [], null, 1)}\n</requirements>`,
          `<approach>\nProject type: ${p.projectType}\nSector: ${p.sector}\nEngagement model: ${p.engagementModel}\n</approach>`,
          `<references_kept>\n${JSON.stringify(references.map(({ title, client, year, projectType, sector, outcome, engagementModel, fee, tags }) => ({ title, client, year, projectType, sector, outcome, engagementModel, fee, tags })), null, 1)}\n</references_kept>`,
          `<case_studies_kept>\n${JSON.stringify(keptCases.map(({ title, client, projectType, sector }) => ({ title, client, projectType, sector })), null, 1)}\n</case_studies_kept>`,
          'Do task 2: find gaps and assumptions.',
        ].join('\n\n'),
      },
    ],
  });
  return {
    questions: result.questions.map((q) => ({ ...q, id: randomUUID().slice(0, 8), mode: 'placeholder', answer: '' })),
    assumptions: result.assumptions.map((a) => ({ ...a, id: randomUUID().slice(0, 8) })),
  };
}

/**
 * Runs one Claude step for a proposal and saves the result, unless the person cancelled
 * (or started another run) in the meantime. Returns the saved proposal.
 */
export async function runStep(
  id: string,
  kind: 'analyse' | 'gaps',
): Promise<Proposal> {
  const start = await db.getProposal(id);
  if (!start) throw new AIError('That proposal no longer exists.', 404);
  const runId = randomUUID();
  const running: Proposal = {
    ...start,
    step: kind === 'analyse' ? 'analysing' : 'gaps',
    runId,
    runStartedAt: new Date().toISOString(),
    runError: undefined,
    updatedAt: new Date().toISOString(),
  };
  await db.putProposal(running);

  const finish = async (change: Partial<Proposal>) => {
    const now = await db.getProposal(id);
    if (!now || now.runId !== runId) return now ?? running; // cancelled or superseded
    const done: Proposal = { ...now, ...change, runId: undefined, runStartedAt: undefined, updatedAt: new Date().toISOString() };
    await db.putProposal(done);
    return done;
  };

  try {
    if (kind === 'analyse') {
      const analysis = await analyse(running);
      return finish({
        step: 'brief',
        analysis,
        projectType: analysis.projectType,
        sector: analysis.sector,
        engagementModel: analysis.engagementModel,
        // Start with the strong matches ticked; the person can change them.
        references: analysis.similarProposals.filter((s) => s.match >= 75).map((s) => s.itemId),
        caseStudyRefs: analysis.caseStudies.slice(0, 3).map((c) => c.caseStudyId),
      });
    }
    const gaps = await findGaps(running);
    // Keep the person's own assumptions (answers and ones they added) when checking again.
    const own = running.assumptions.filter((a) => a.source === 'Your answer' && !a.questionId);
    return finish({ questions: gaps.questions, assumptions: [...gaps.assumptions, ...own] });
  } catch (e) {
    const message = e instanceof AIError ? e.message : 'Something went wrong while Claude was working. Try again.';
    if (!(e instanceof AIError)) console.error(e);
    await finish({ step: kind === 'analyse' ? 'sources' : 'brief', runError: message });
    throw e;
  }
}
