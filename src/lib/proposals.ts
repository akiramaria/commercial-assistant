import { api } from './api';
import { uid } from './format';
import { go } from './router';
import type { AssumptionSource, Proposal, ProposalStep } from './types';

export const SOURCE_TAGS = ['RFP', 'ITQ', 'Brief', 'Addendum', 'Q&A', 'BD notes', 'Other'];
export const ASSUMPTION_SOURCES: AssumptionSource[] = ['Template', 'Past proposal', 'AI suggested', 'Your answer'];

/** Files Claude can read. Older .doc and .ppt files need saving as .docx or .pptx first. */
export const SOURCE_ACCEPT = '.pdf,.docx,.pptx,.txt,.md';
export const readableSource = (name: string) => /\.(pdf|docx|pptx|txt|md)$/i.test(name);
export const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

/** A first guess at what a file is, from its name. */
export function guessTag(name: string, group: 'rfp' | 'notes'): string {
  const n = name.toLowerCase();
  if (/addend/.test(n)) return 'Addendum';
  if (/\bq&?a\b|clarif|question/.test(n)) return 'Q&A';
  if (/\bitq\b/.test(n)) return 'ITQ';
  if (/\brf[pqi]\b|tender/.test(n)) return 'RFP';
  if (group === 'notes' || /note|call|meeting|minutes/.test(n)) return 'BD notes';
  return /brief/.test(n) ? 'Brief' : 'RFP';
}

export function blankProposal(owner: string): Proposal {
  const now = new Date().toISOString();
  return {
    id: `p-${uid()}`,
    title: '',
    deadline: '',
    hubspotDeal: '',
    serviceLine: '',
    need: 'full',
    client: '',
    includeSectorSlide: true,
    sources: [],
    notes: '',
    step: 'sources',
    references: [],
    caseStudyRefs: [],
    projectType: '',
    sector: '',
    engagementModel: '',
    questions: [],
    assumptions: [],
    owner,
    createdAt: now,
    updatedAt: now,
  };
}

/** Creates an empty proposal and opens its first step. */
export async function startProposal(owner: string) {
  const p = await api.saveProposal(blankProposal(owner));
  go(`/proposals/${p.id}`);
}

export function dueLabel(deadline: string): string {
  const d = new Date(deadline);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function savedLabel(iso: string, now = Date.now()): string {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Saved just now';
  if (mins < 60) return `Saved ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Saved ${hours} h ago`;
  return `Saved ${dueLabel(iso)}`;
}

/** "S$112,000" or "112000" → "S$112k". Anything else is shown as written. */
export function shortFee(fee: string): string {
  const n = Number(fee.replace(/[^\d.]/g, ''));
  if (!fee.trim() || !Number.isFinite(n) || n <= 0) return fee.trim();
  return n >= 1000 ? `S$${Math.round(n / 1000)}k` : `S$${n}`;
}

/** Which of the four steps a proposal's state belongs to. */
export const STEP_NUMBER: Record<ProposalStep, number> = { sources: 1, analysing: 2, brief: 2, gaps: 3, draft: 4 };

export const initials = (email: string) => email.split('@')[0].slice(0, 2).toUpperCase();
