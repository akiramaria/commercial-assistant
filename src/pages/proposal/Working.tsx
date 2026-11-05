import { useEffect, useState } from 'react';
import { Icon, icons } from '../../components/icons';
import { Button } from '../../components/ui';
import { useStore } from '../../lib/store';
import type { Proposal } from '../../lib/types';

// The "Reading your sources" screen. Claude works in one call, so the checklist moves on a
// timer that roughly follows a typical run; the last step stays open until the result arrives.

const EXPECTED_S = 90;
const STALE_S = 6 * 60;

type Step = [doing: string, done: string, at: number];

function analyseSteps(p: Proposal): Step[] {
  const files = p.sources.filter((s) => s.group !== 'logo');
  const tags = [...new Set(files.map((s) => s.tag))];
  const what = [...tags, ...(p.notes.trim() && !tags.includes('BD notes') ? ['BD notes'] : [])];
  const list = what.length > 1 ? `${what.slice(0, -1).join(', ')} and ${what.at(-1)}` : (what[0] ?? 'sources');
  return [
    [`Reading the ${list}`, `Read the ${list}`, 10],
    ['Pulling out requirements, deliverables and the deadline', 'Pulled out requirements, deliverables and the deadline', 25],
    ['Identifying the project type and sector', 'Identified the project type and sector', 38],
    ['Finding comparable past proposals and case studies', 'Found comparable past proposals and case studies', 55],
    ['Summarising the brief', 'Summarised the brief', 72],
    ['Drafting the suggested approach', 'Drafted the suggested approach', Infinity],
  ];
}

const GAP_STEPS: Step[] = [
  ['Re-reading the brief and your notes', 'Re-read the brief and your notes', 10],
  ['Comparing with the references you kept', 'Compared with the references you kept', 25],
  ['Checking for missing information', 'Checked for missing information', 45],
  ['Writing questions and placeholder answers', 'Wrote questions and placeholder answers', 65],
  ['Listing assumptions', 'Listed assumptions', Infinity],
];

export function Working({ p, kind, onCancel, onRetry }: { p: Proposal; kind: 'analyse' | 'gaps'; onCancel: () => void; onRetry: () => void }) {
  const { items, caseStudies } = useStore();
  const started = new Date(p.runStartedAt ?? Date.now()).getTime();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const elapsed = Math.max(0, (now - started) / 1000);
  const steps = kind === 'analyse' ? analyseSteps(p) : GAP_STEPS;
  const active = steps.findIndex(([, , at]) => elapsed < at);
  // Eases towards 95% so the bar keeps moving without claiming to be done.
  const progress = Math.min(95, (1 - Math.exp(-elapsed / (EXPECTED_S * 0.6))) * 100);
  const stale = elapsed > STALE_S;
  const pastWork = items.filter((i) => i.docType === 'Proposal' || i.docType === 'Past project').length;

  return (
    <div className="flow-body flow-center">
      <section className="working">
        <div className="working-icon">
          <Icon src={icons.sparkle22} size={22} />
        </div>
        <div className="working-head">
          <h2>{kind === 'analyse' ? 'Reading your sources' : 'Finding gaps and assumptions'}</h2>
          <p>
            {stale
              ? 'This is taking longer than usual. It may have stopped; you can try again.'
              : 'This usually takes 1 to 2 minutes. You can leave this page and come back; the result is saved when it’s ready.'}
          </p>
        </div>
        <div className="working-bar" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${progress}%` }} />
        </div>
        <ul className="working-steps">
          {steps.map(([doing, done], i) => {
            const state = i < active ? 'done' : i === active ? 'doing' : 'todo';
            return (
              <li key={doing} className={`working-step is-${state}`}>
                <span className="working-step-icon">
                  <Icon src={state === 'done' ? icons.check18 : state === 'doing' ? icons.spinner : icons.stepPending} size={18} className={state === 'doing' ? 'spin' : undefined} />
                </span>
                {state === 'done' ? done : doing}
              </li>
            );
          })}
        </ul>
        <div className="divider" />
        <div className="working-foot">
          <span>
            Sources: {kind === 'analyse' ? `your ${p.sources.filter((s) => s.group !== 'logo').length ? 'files' : 'notes'}, ` : 'the confirmed brief, '}
            {pastWork} past proposals and {caseStudies.length} case studies in the knowledge pool
          </span>
          {stale && (
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          )}
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </section>
    </div>
  );
}
