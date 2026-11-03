import type { CaseStudy, PoolItem } from './types';

// Sample rows taken from the Figma screens so the tables aren't empty on first run.
// They are flagged `sample` and can be removed from the table footer.

type Seed = Partial<PoolItem> & Pick<PoolItem, 'id' | 'title' | 'docType'>;

function item(s: Seed): PoolItem {
  return {
    kind: 'file',
    name: `${s.title}.pdf`,
    client: '',
    year: '',
    projectType: '',
    sector: '',
    serviceLine: '',
    outcome: '',
    engagementModel: '',
    fee: '',
    sensitive: false,
    tags: [],
    addedBy: 'Jordan Lee',
    addedAt: '2026-01-01T00:00:00.000Z',
    sample: true,
    ...s,
  };
}

const SED = 'Service & Experience Design';

export const seedItems: PoolItem[] = [
  item({ id: 's-p1', title: 'Retail app onboarding redesign', docType: 'Proposal', client: 'Harbour Credit Union', projectType: 'Product design', sector: 'Banking', serviceLine: SED, outcome: 'Won', fee: '112000', year: '2025', engagementModel: 'Fixed price', tags: ['onboarding', 'mobile app'] }),
  item({ id: 's-p2', title: 'Account opening research', docType: 'Proposal', client: 'Kestrel Private Bank', projectType: 'Research & Insights', sector: 'Banking', serviceLine: SED, outcome: 'Lost · Price', fee: '64000', year: '2024', sensitive: true, tags: ['account opening'] }),
  item({ id: 's-p3', title: 'Digital banking design system', docType: 'Proposal', client: 'Northshore Bank', projectType: 'Design systems', sector: 'Banking', serviceLine: SED, outcome: 'Won', fee: '146000', year: '2023', tags: ['design system'] }),
  item({ id: 's-p4', title: 'Wealth app usability test', docType: 'Proposal', client: 'Kestrel Private Bank', projectType: 'Research & Insights', sector: 'Banking', serviceLine: SED, outcome: 'Lost · Price', fee: '36000', year: '2026', tags: ['usability testing'] }),
  item({ id: 's-p5', title: 'AI readiness workshop series', docType: 'Proposal', client: 'Meridian Insurance', projectType: 'AI by design', sector: 'Insurance', serviceLine: 'Strategy & Innovation', outcome: 'Won', fee: '38000', year: '2026', tags: ['AI', 'workshops'] }),
  item({ id: 's-p6', title: 'Claims portal build', docType: 'Proposal', client: 'Meridian Insurance', projectType: 'Web development', sector: 'Insurance', serviceLine: 'Development & Delivery', outcome: 'Lost · Scope fit', fee: '210000', year: '2025', tags: ['claims', 'portal'] }),
  item({ id: 's-p7', title: 'Learning platform UX review', docType: 'Proposal', client: 'Northpoint College', projectType: 'Experience optimisation', sector: 'Education', serviceLine: '', outcome: 'Lost · Not disclosed', fee: '24000', year: '2026' }),

  item({ id: 's-pp1', title: 'Retail app onboarding redesign', name: 'Harbour_CU_Closure_Report.pdf', docType: 'Past project', client: 'Harbour Credit Union', projectType: 'Product design', sector: 'Banking', serviceLine: SED, year: '2025', engagementModel: 'Fixed price', tags: ['onboarding', 'lessons captured'] }),
  item({ id: 's-pp2', title: 'Digital banking design system', docType: 'Past project', client: 'Northshore Bank', projectType: 'Design systems', sector: 'Banking', serviceLine: SED, year: '2023', engagementModel: 'Time & materials', tags: ['design system', 'lessons captured'] }),
  item({ id: 's-pp3', title: 'Service blueprint workshop', docType: 'Past project', client: 'Eastgate Polytechnic', projectType: 'Service design', sector: 'Education', serviceLine: SED, year: '2026', engagementModel: 'Fixed price' }),
  item({ id: 's-pp4', title: 'AI readiness workshop series', docType: 'Past project', client: 'Meridian Insurance', projectType: 'AI by design', sector: 'Insurance', serviceLine: 'Strategy & Innovation', year: '2026', engagementModel: 'Fixed price', tags: ['AI', 'lessons captured'] }),

  item({ id: 's-r1', title: 'Member app modernisation RFP', docType: 'RFP', client: 'Harbour Credit Union', projectType: 'Product design', sector: 'Banking', serviceLine: SED, outcome: 'Won', fee: '120000', year: '2025' }),
  item({ id: 's-r2', title: 'Citizen services digital front door', docType: 'RFP', client: 'Civic Services Agency', projectType: 'Service design', sector: 'Public sector', serviceLine: SED, outcome: 'Declined', fee: '300000', year: '2026' }),
];

export const seedCaseStudies: CaseStudy[] = [
  { id: 's-c1', title: 'Redesigning retail app onboarding', client: 'Harbour Credit Union', year: '2025', projectType: 'Product design', sector: 'Banking', serviceLine: SED, permission: 'Named, approved', challenge: 'Members abandoned the app sign-up before verifying their identity.', approach: 'Diary study, then three rounds of prototype testing on the new flow.', impact: 'Completion rose from 41% to 68% within a quarter of launch.', tags: ['onboarding', 'mobile app'], sourceIds: ['s-p1', 's-pp1'], updatedAt: '2026-03-12T00:00:00.000Z', sample: true },
  { id: 's-c2', title: 'A design system for digital banking', client: 'Northshore Bank', year: '2023', projectType: 'Design systems', sector: 'Banking', serviceLine: SED, permission: 'Anonymised only', challenge: '', approach: '', impact: '', tags: ['design system'], sourceIds: ['s-p3', 's-pp2'], updatedAt: '2024-11-04T00:00:00.000Z', sample: true },
  { id: 's-c3', title: 'Finding AI use cases in claims', client: 'Meridian Insurance', year: '2026', projectType: 'AI by design', sector: 'Insurance', serviceLine: 'Strategy & Innovation', permission: 'Awaiting client', challenge: '', approach: '', impact: '', tags: ['AI', 'claims'], sourceIds: ['s-p5'], updatedAt: '2026-08-20T00:00:00.000Z', sample: true },
  { id: 's-c4', title: 'Student services blueprint', client: 'Eastgate Polytechnic', year: '2026', projectType: 'Service design', sector: 'Education', serviceLine: SED, permission: 'Named, approved', challenge: '', approach: '', impact: '', tags: [], sourceIds: ['s-pp3'], updatedAt: '2026-01-15T00:00:00.000Z', sample: true },
  { id: 's-c5', title: 'Mapping citizen journeys', client: 'Civic Services Agency', year: '2025', projectType: 'Research & Insights', sector: 'Public sector', serviceLine: SED, permission: 'Internal only', challenge: '', approach: '', impact: '', tags: [], sourceIds: [], updatedAt: '2025-06-02T00:00:00.000Z', sample: true },
];
