export type DocType = 'Proposal' | 'Case study' | 'Past project' | 'RFP' | 'BD notes' | 'Context note';

export interface PoolItem {
  id: string;
  kind: 'file' | 'context';
  /** Original file name, or the context note's title. */
  name: string;
  /** Display title shown in tables. */
  title: string;
  size?: number;
  mime?: string;
  /** Text of a written context note. */
  body?: string;
  docType: DocType | '';
  client: string;
  year: string;
  projectType: string;
  sector: string;
  serviceLine: string;
  outcome: string;
  engagementModel: string;
  fee: string;
  sensitive: boolean;
  tags: string[];
  addedBy: string;
  addedAt: string;
  sample?: boolean;
  /** Set by the server when an uploaded file is stored for this item. */
  hasFile?: boolean;
}

export type Permission = 'Named, approved' | 'Anonymised only' | 'Awaiting client' | 'Internal only';

export interface CaseStudy {
  id: string;
  title: string;
  client: string;
  year: string;
  projectType: string;
  sector: string;
  serviceLine: string;
  permission: Permission | '';
  challenge: string;
  approach: string;
  impact: string;
  tags: string[];
  sourceIds: string[];
  updatedAt: string;
  sample?: boolean;
}

export const REQUIRED_FIELDS = ['docType', 'client', 'projectType', 'sector', 'serviceLine'] as const;

export const FIELD_LABELS: Record<string, string> = {
  docType: 'Document type',
  client: 'Client',
  year: 'Year',
  projectType: 'Project type',
  sector: 'Sector',
  serviceLine: 'Service line',
  outcome: 'Outcome',
  engagementModel: 'Engagement model',
  fee: 'Fee (SGD)',
  permission: 'Client permission',
};

export function missingTags(item: Pick<PoolItem, (typeof REQUIRED_FIELDS)[number]>): string[] {
  return REQUIRED_FIELDS.filter((f) => !String(item[f] ?? '').trim());
}

/** What the case study matcher returns for a brief. Shapes follow the curation note in the skill. */
export interface MatchResult {
  /** "needs_input" when the skill says to stop and ask (no brief, personal data, unclear sector). */
  status: 'ok' | 'needs_input';
  question: string;
  briefProfile: { label: string; value: string; clause: string }[];
  shortlist: {
    rank: number;
    caseStudyId: string;
    title: string;
    projectTypeMatch: 'P1' | 'P2' | 'P3';
    projectTypeReason: string;
    sectorMatch: 'S1' | 'S2' | 'S3';
    why: string;
    namingStatus: 'Named' | 'Masked';
    flags: string[];
  }[];
  notShortlisted: { caseStudyId: string; title: string; reason: string }[];
  uncoveredWork: { itemId: string; title: string; why: string; recommendWriteUp: boolean }[];
  gaps: string[];
  classifications: { caseStudyId: string; title: string; workType: string; surface: string; sector: string; year: string; status: string }[];
}

export interface MatchRequest {
  /** Pasted brief text. */
  text: string;
  /** An uploaded PDF or text file: base64 `data` when files are stored locally, or a Blob folder (briefs/<id>/) on Vercel. */
  file?: { name: string; mime: string; data?: string; blobPath?: string };
  /** An RFP already in the knowledge pool. */
  itemId?: string;
  count?: number;
}

// ---------- Proposals ----------

export type ProposalStep = 'sources' | 'analysing' | 'brief' | 'gaps' | 'draft';

export interface ProposalSource {
  /** Also the storage id of the file (sources/<id>/ in Blob, or the file name in the local files folder). */
  id: string;
  /** Which card the file was added to. */
  group: 'rfp' | 'notes' | 'logo';
  name: string;
  size: number;
  mime: string;
  /** What the file is: RFP, Addendum, Brief, BD notes, … */
  tag: string;
}

export interface BriefPoint {
  label: string;
  text: string;
  /** Where it came from, e.g. "RFP p.4" or "BD notes". Empty if not stated. */
  source: string;
}

export interface ProposalAnalysis {
  /** One or two sentences shown in the banner above the brief. */
  headline: string;
  /** Objective, Scope asked, Deliverables and Timeline first, then anything else the brief covers. */
  summary: BriefPoint[];
  requirements: BriefPoint[];
  projectType: string;
  sector: string;
  engagementModel: string;
  /** Why this approach, e.g. which past proposal the phases are based on. */
  approachNote: string;
  similarProposals: { itemId: string; match: number; why: string }[];
  caseStudies: { caseStudyId: string; match: number; why: string }[];
}

export type AssumptionSource = 'Template' | 'Past proposal' | 'AI suggested' | 'Your answer';

export interface GapQuestion {
  id: string;
  question: string;
  /** Why it's a gap: what the sources do or don't say. */
  why: string;
  placeholder: string;
  mode: 'answer' | 'placeholder';
  answer: string;
}

export interface Assumption {
  id: string;
  text: string;
  source: AssumptionSource;
  /** Set when the assumption is an answer to one of the gap questions. */
  questionId?: string;
}

export interface Proposal {
  id: string;
  title: string;
  /** datetime-local value, e.g. 2026-11-14T17:00 */
  deadline: string;
  hubspotDeal: string;
  serviceLine: string;
  need: 'full' | 'pricing';
  client: string;
  includeSectorSlide: boolean;
  sources: ProposalSource[];
  notes: string;
  step: ProposalStep;
  /** Identifies the analysis or gap check in progress, so a cancelled run's result is ignored. */
  runId?: string;
  runStartedAt?: string;
  /** The last run's error, shown on the page it came back to. */
  runError?: string;
  analysis?: ProposalAnalysis;
  /** Selected references, as knowledge-pool item ids and case-study ids. */
  references: string[];
  caseStudyRefs: string[];
  projectType: string;
  sector: string;
  engagementModel: string;
  questions: GapQuestion[];
  assumptions: Assumption[];
  owner: string;
  createdAt: string;
  updatedAt: string;
}
