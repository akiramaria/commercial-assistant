import type { DocType, Permission } from './types';

export const DOC_TYPES: DocType[] = ['Proposal', 'Case study', 'Past project', 'RFP', 'BD notes', 'Context note'];

export const PROJECT_TYPES = [
  'Product design',
  'Research & Insights',
  'Design systems',
  'AI by design',
  'Web development',
  'Experience optimisation',
  'Service design',
];

export const SECTORS = ['Banking', 'Insurance', 'Education', 'Public sector', 'Healthcare', 'Retail'];

export const SERVICE_LINES = ['Service & Experience Design', 'Strategy & Innovation', 'Development & Delivery'];

export const OUTCOMES = ['Won', 'Lost · Price', 'Lost · Scope fit', 'Lost · Not disclosed', 'Pending'];

export const RFP_RESPONSES = ['Responded', 'Declined', 'Shortlisted', 'Won', 'Lost'];

export const ENGAGEMENT_MODELS = ['Fixed price', 'Time & materials', 'Retainer'];

export const PERMISSIONS: Permission[] = ['Named, approved', 'Anonymised only', 'Awaiting client', 'Internal only'];

/** Which knowledge-pool tab an item of a given document type lives in. */
export function tabForDocType(t: DocType | ''): string {
  switch (t) {
    case 'Proposal':
      return 'proposals';
    case 'Past project':
      return 'past-projects';
    case 'RFP':
      return 'rfps';
    case 'Case study':
      return 'case-studies';
    default:
      return 'notes';
  }
}

export function uniqSorted(...lists: string[][]): string[] {
  return Array.from(new Set(lists.flat().filter(Boolean))).sort((a, b) => a.localeCompare(b));
}
