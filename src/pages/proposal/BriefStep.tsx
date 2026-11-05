import { useState } from 'react';
import { Icon, icons } from '../../components/icons';
import { Button, Field, SelectBox } from '../../components/ui';
import { ENGAGEMENT_MODELS, PROJECT_TYPES, SECTORS } from '../../lib/options';
import { shortFee } from '../../lib/proposals';
import { useStore } from '../../lib/store';
import type { BriefPoint, Proposal, ProposalAnalysis } from '../../lib/types';

interface Props {
  p: Proposal;
  analysis: ProposalAnalysis;
  update: (change: Partial<Proposal> | ((cur: Proposal) => Partial<Proposal>)) => void;
  onViewSources: () => void;
}

export function BriefStep({ p, analysis, update, onViewSources }: Props) {
  const { items, caseStudies } = useStore();
  const [editing, setEditing] = useState(false);
  const [showReqs, setShowReqs] = useState(false);

  const setPoint = (i: number, text: string) =>
    update((cur) => ({ analysis: cur.analysis && { ...cur.analysis, summary: cur.analysis.summary.map((pt, j) => (j === i ? { ...pt, text } : pt)) } }));
  const toggle = (key: 'references' | 'caseStudyRefs', id: string) =>
    update((cur) => ({ [key]: cur[key].includes(id) ? cur[key].filter((x) => x !== id) : [...cur[key], id] }));

  // Matches whose knowledge-pool record has since been deleted are left out.
  const proposals = analysis.similarProposals.flatMap((m) => {
    const item = items.find((i) => i.id === m.itemId);
    return item ? [{ ...m, item }] : [];
  });
  const cases = analysis.caseStudies.flatMap((m) => {
    const cs = caseStudies.find((c) => c.id === m.caseStudyId);
    return cs ? [{ ...m, cs }] : [];
  });

  return (
    <div className="flow-body">
      <div className="ai-banner">
        <Icon src={icons.sparkle18} size={18} />
        <p>{analysis.headline}</p>
        <Button variant="ghost" onClick={onViewSources}>
          View sources
        </Button>
      </div>

      <div className="flow-cols">
        <section className="card flow-col-main">
          <div className="card-head">
            <h3 className="card-title">Brief summary</h3>
            <div className="flex-1" />
            <button type="button" className={`icon-btn${editing ? ' is-on' : ''}`} onClick={() => setEditing((e) => !e)} aria-label={editing ? 'Done editing' : 'Edit the summary'} aria-pressed={editing}>
              <Icon src={icons.edit} size={16} />
            </button>
          </div>
          {analysis.summary.map((pt, i) => (
            <div key={pt.label} className="brief-point">
              {i > 0 && <div className="divider" />}
              <span className="brief-label">{pt.label}</span>
              {editing ? (
                <textarea className="brief-edit" value={pt.text} rows={Math.max(2, Math.ceil(pt.text.length / 80))} onChange={(e) => setPoint(i, e.target.value)} />
              ) : (
                <p className="brief-text">{pt.text}</p>
              )}
              <SourceRef point={pt} />
            </div>
          ))}
          {editing && (
            <Button variant="secondary" className="self-start" onClick={() => setEditing(false)}>
              Done editing
            </Button>
          )}
          {analysis.requirements.length > 0 && (
            <>
              <Button variant="ghost" className="self-start" onClick={() => setShowReqs((s) => !s)}>
                {showReqs ? 'Hide requirements' : `See all ${analysis.requirements.length} requirements`}
              </Button>
              {showReqs && (
                <ol className="req-list">
                  {analysis.requirements.map((r, i) => (
                    <li key={i}>
                      {r.text}
                      {r.source && <span className="hint"> · {r.source}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </section>

        <div className="flow-col-side">
          <section className="card">
            <h3 className="card-title">Comparable past proposals</h3>
            <p className="card-desc">Pick the ones to use as references for effort, assumptions and case studies.</p>
            {proposals.length ? (
              <>
                <p className="match-count-label">
                  {proposals.length} proposal match{proposals.length === 1 ? '' : 'es'} found
                </p>
                {proposals.map(({ item, match, why }) => (
                  <MatchCard
                    key={item.id}
                    title={item.title}
                    meta={[item.client, item.year].filter(Boolean).join(' · ')}
                    match={match}
                    why={why}
                    tags={[
                      item.outcome && { label: item.outcome, tone: item.outcome === 'Won' ? 'dark' : item.outcome.startsWith('Lost') ? 'muted' : 'outline' },
                      item.fee && { label: shortFee(item.fee), tone: 'outline' },
                    ]}
                    checked={p.references.includes(item.id)}
                    label="Use as reference"
                    onToggle={() => toggle('references', item.id)}
                  />
                ))}
              </>
            ) : (
              <p className="hint">No comparable past proposals in the knowledge pool yet.</p>
            )}
            <p className="hint">From past proposals and project records in the knowledge pool.</p>
          </section>

          <section className="card">
            <h3 className="card-title">Relevant case studies</h3>
            <p className="card-desc">Pick the ones to include as evidence in the proposal.</p>
            {cases.length ? (
              cases.map(({ cs, match, why }) => (
                <MatchCard
                  key={cs.id}
                  title={cs.title}
                  meta={[cs.permission === 'Named, approved' ? cs.client : 'Client masked', cs.year].filter(Boolean).join(' · ')}
                  match={match}
                  why={why}
                  tags={[cs.projectType && { label: cs.projectType, tone: 'outline' }, cs.sector && { label: cs.sector, tone: 'outline' }]}
                  checked={p.caseStudyRefs.includes(cs.id)}
                  label="Use in proposal"
                  onToggle={() => toggle('caseStudyRefs', cs.id)}
                />
              ))
            ) : (
              <p className="hint">No relevant case studies in the knowledge pool yet.</p>
            )}
          </section>

          <section className="card">
            <h3 className="card-title">Shape the approach</h3>
            <Field label="Project type">
              <SelectBox value={p.projectType} options={PROJECT_TYPES} onChange={(projectType) => update({ projectType })} />
            </Field>
            <Field label="Sector">
              <SelectBox value={p.sector} options={SECTORS} onChange={(sector) => update({ sector })} />
            </Field>
            <Field label="Engagement model">
              <SelectBox value={p.engagementModel} options={ENGAGEMENT_MODELS} onChange={(engagementModel) => update({ engagementModel })} />
            </Field>
            {analysis.approachNote && <p className="hint">{analysis.approachNote}</p>}
          </section>
        </div>
      </div>
    </div>
  );
}

function SourceRef({ point }: { point: BriefPoint }) {
  if (!point.source) return null;
  return (
    <span className="brief-source">
      <Icon src={icons.link12} size={12} />
      {point.source}
    </span>
  );
}

type TagSpec = { label: string; tone: 'dark' | 'muted' | 'outline' } | '' | undefined;

function MatchCard({
  title,
  meta,
  match,
  why,
  tags,
  checked,
  label,
  onToggle,
}: {
  title: string;
  meta: string;
  match: number;
  why: string;
  tags: TagSpec[];
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <div className="ref-card">
      <div className="ref-head">
        <div className="ref-title">
          <span>{title}</span>
          <span className="ref-meta">{meta}</span>
        </div>
        <span className="ref-match">{match}% match</span>
      </div>
      {why && <p className="ref-why">{why}</p>}
      {tags.some(Boolean) && (
        <div className="ref-tags">
          {tags.map((t) => t && <span key={t.label} className={`pill pill-${t.tone}`}>{t.label}</span>)}
        </div>
      )}
      <label className="checkbox">
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <span className={`checkbox-box${checked ? ' is-checked' : ''}`}>{checked && <Icon src={icons.check} size={12} />}</span>
        <span className="checkbox-label">{label}</span>
      </label>
    </div>
  );
}
