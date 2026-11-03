import { useMemo, useState } from 'react';
import { useOptions, useStore } from '../lib/store';
import { go } from '../lib/router';
import type { CaseStudy, PoolItem } from '../lib/types';
import { PERMISSIONS, uniqSorted } from '../lib/options';
import { monthYear, uid } from '../lib/format';
import { downloadFile } from '../lib/files';
import { Button, ComboBox, Field, SelectBox, TagInput, TextArea, TextBox } from '../components/ui';
import { Icon, icons } from '../components/icons';
import { tagSummary } from '../components/ItemFields';

function blankCase(): CaseStudy {
  return {
    id: uid(),
    title: '',
    client: '',
    year: '',
    projectType: '',
    sector: '',
    serviceLine: '',
    permission: '',
    challenge: '',
    approach: '',
    impact: '',
    tags: [],
    sourceIds: [],
    updatedAt: new Date().toISOString(),
  };
}

/** Copies tags from a source document into empty case-study fields. */
function fillFrom(cs: CaseStudy, src: PoolItem): CaseStudy {
  return {
    ...cs,
    title: cs.title || src.title,
    client: cs.client || src.client,
    year: cs.year || src.year,
    projectType: cs.projectType || src.projectType,
    sector: cs.sector || src.sector,
    serviceLine: cs.serviceLine || src.serviceLine,
    permission: cs.permission || (src.sensitive ? 'Anonymised only' : ''),
    tags: uniqSorted(cs.tags, src.tags),
  };
}

export function CaseStudyEditor({ id, sourceId }: { id?: string; sourceId?: string | null }) {
  const { items, caseStudies, saveCaseStudy, removeCaseStudy, notify } = useStore();
  const opts = useOptions();
  const existing = id ? caseStudies.find((c) => c.id === id) : undefined;

  const [cs, setCs] = useState<CaseStudy>(() => {
    if (existing) return existing;
    const base = blankCase();
    const src = sourceId ? items.find((i) => i.id === sourceId) : undefined;
    return src ? { ...fillFrom(base, src), sourceIds: [src.id] } : base;
  });
  const [q, setQ] = useState('');
  const [onlyMatching, setOnlyMatching] = useState(true);

  const patch = (p: Partial<CaseStudy>) => setCs((c) => ({ ...c, ...p }));
  const sources = cs.sourceIds.map((sid) => items.find((i) => i.id === sid)).filter(Boolean) as PoolItem[];

  // Candidate sources: everything in the pool, ranked by how well its tags match this case study.
  const candidates = useMemo(() => {
    const score = (i: PoolItem) =>
      (cs.client && i.client === cs.client ? 4 : 0) +
      (cs.projectType && i.projectType === cs.projectType ? 2 : 0) +
      (cs.sector && i.sector === cs.sector ? 1 : 0) +
      (cs.serviceLine && i.serviceLine === cs.serviceLine ? 1 : 0) +
      i.tags.filter((t) => cs.tags.includes(t)).length;
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hasCriteria = Boolean(cs.client || cs.projectType || cs.sector || cs.serviceLine || cs.tags.length);
    return items
      .filter((i) => !cs.sourceIds.includes(i.id))
      .map((i) => ({ i, s: score(i) }))
      .filter(({ i, s }) => {
        if (words.length) {
          const hay = [i.title, i.name, i.client, i.projectType, i.sector, i.serviceLine, i.docType, ...i.tags].join(' ').toLowerCase();
          return words.every((w) => hay.includes(w));
        }
        return !onlyMatching || !hasCriteria || s > 0;
      })
      .sort((a, b) => b.s - a.s || b.i.year.localeCompare(a.i.year));
  }, [items, cs, q, onlyMatching]);

  const addSource = (src: PoolItem) => setCs((c) => ({ ...fillFrom(c, src), sourceIds: [...c.sourceIds, src.id] }));
  const removeSource = (sid: string) => patch({ sourceIds: cs.sourceIds.filter((s) => s !== sid) });

  const canSave = cs.title.trim() && cs.client.trim();
  const save = async () => {
    if (!canSave) return;
    if (!(await saveCaseStudy(cs))) return;
    notify(existing ? 'Case study updated.' : 'Case study saved.');
    go('/pool/case-studies');
  };

  return (
    <div className="page">
      <header className="page-header">
        <div className="crumbs">
          <button type="button" className="link-quiet" onClick={() => go('/pool/proposals')}>
            Knowledge pool
          </button>
          &nbsp;&nbsp;/&nbsp;&nbsp;
          <button type="button" className="link-quiet" onClick={() => go('/pool/case-studies')}>
            Case studies
          </button>
          &nbsp;&nbsp;/&nbsp;&nbsp;{existing ? 'Edit' : 'New'}
        </div>
        <div className="row-center">
          <h1>{existing ? existing.title : 'Curate case study'}</h1>
          <div className="flex-1" />
          {existing && <span className="hint">Updated {monthYear(existing.updatedAt)}</span>}
        </div>
      </header>

      <div className="page-body">
        <div className="page-main">
          <section className="card">
            <h2>Details</h2>
            <Field label="Title" missing={!cs.title.trim()}>
              <TextBox value={cs.title} placeholder="e.g. Redesigning retail app onboarding" onChange={(title) => patch({ title })} />
            </Field>
            <div className="field-row">
              <Field label="Client" missing={!cs.client.trim()}>
                <ComboBox value={cs.client} options={opts.clients} onChange={(client) => patch({ client })} />
              </Field>
              <Field label="Year">
                <TextBox value={cs.year} inputMode="numeric" placeholder="2026" onChange={(v) => patch({ year: v.replace(/[^0-9]/g, '').slice(0, 4) })} />
              </Field>
              <Field label="Client permission">
                <SelectBox value={cs.permission} options={PERMISSIONS} onChange={(v) => patch({ permission: v as CaseStudy['permission'] })} />
              </Field>
            </div>
            <div className="field-row">
              <Field label="Project type">
                <ComboBox value={cs.projectType} options={opts.projectTypes} onChange={(projectType) => patch({ projectType })} />
              </Field>
              <Field label="Sector">
                <ComboBox value={cs.sector} options={opts.sectors} onChange={(sector) => patch({ sector })} />
              </Field>
              <Field label="Service line">
                <ComboBox value={cs.serviceLine} options={opts.serviceLines} onChange={(serviceLine) => patch({ serviceLine })} />
              </Field>
            </div>
            <Field label="Keywords">
              <TagInput value={cs.tags} suggestions={opts.tags} onChange={(tags) => patch({ tags })} />
            </Field>
          </section>

          <section className="card">
            <h2>Story</h2>
            <Field label="Challenge">
              <TextArea value={cs.challenge} rows={3} placeholder="What problem did the client bring to us?" onChange={(challenge) => patch({ challenge })} />
            </Field>
            <Field label="Approach">
              <TextArea value={cs.approach} rows={3} placeholder="What did we do, and how?" onChange={(approach) => patch({ approach })} />
            </Field>
            <Field label="Impact">
              <TextArea value={cs.impact} rows={3} placeholder="What changed? Numbers help." onChange={(impact) => patch({ impact })} />
            </Field>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Sources</h2>
              <span className="tab-count">{sources.length}</span>
            </div>
            {sources.length === 0 && <p className="hint">Pick proposals, closure reports or notes from the pool on the right. Their tags fill in empty details.</p>}
            {sources.map((s) => (
              <div key={s.id} className="source-row">
                <Icon src={s.kind === 'context' ? icons.message : icons.file18} size={18} />
                <div className="flex-1 min-w-0">
                  <div className="item-name">{s.title}</div>
                  <div className="item-meta">{tagSummary(s)}</div>
                </div>
                {s.kind === 'file' && s.hasFile && (
                  <button type="button" className="link" onClick={() => downloadFile(s.id, s.name)}>
                    Download
                  </button>
                )}
                <button type="button" className="icon-btn" aria-label={`Remove ${s.title}`} onClick={() => removeSource(s.id)}>
                  <Icon src={icons.x} size={16} />
                </button>
              </div>
            ))}
          </section>
        </div>

        <aside className="page-side">
          <section className="card picker">
            <h2>Add sources from the pool</h2>
            <label className="search w-full">
              <Icon src={icons.search} size={16} />
              <input value={q} placeholder="Search titles, clients, keywords" onChange={(e) => setQ(e.target.value)} />
            </label>
            {!q && (
              <label className="toggle-line">
                <input type="checkbox" checked={onlyMatching} onChange={(e) => setOnlyMatching(e.target.checked)} />
                Only show items that match these details
              </label>
            )}
            <div className="picker-list">
              {candidates.length === 0 && <p className="hint">No matching items. Try searching, or untick the match filter.</p>}
              {candidates.slice(0, 30).map(({ i, s }) => (
                <button key={i.id} type="button" className="picker-item" onClick={() => addSource(i)}>
                  <Icon src={i.kind === 'context' ? icons.message : icons.file16} size={16} />
                  <span className="flex-1 min-w-0">
                    <span className="picker-name">{i.title}</span>
                    <span className="picker-meta">{[i.docType, i.client, i.year].filter(Boolean).join(' · ')}</span>
                  </span>
                  {s >= 4 && <span className="tag">Match</span>}
                  <span className="picker-add">Add</span>
                </button>
              ))}
            </div>
          </section>
          <section className="card card-muted">
            <h3>Before sharing</h3>
            <p className="hint lh-18">
              Set client permission. “Anonymised only” means client names and figures are masked when the assistant reuses this in a proposal.
            </p>
          </section>
        </aside>
      </div>

      <footer className="page-footer">
        <span>
          {sources.length} source{sources.length === 1 ? '' : 's'}
          {!canSave && ' · Add a title and client to save'}
        </span>
        <div className="flex-1" />
        {existing && (
          <Button
            variant="danger"
            onClick={() => {
              if (confirm(`Delete “${existing.title}”? Its source documents stay in the pool.`)) {
                removeCaseStudy(existing.id);
                notify('Case study deleted.');
                go('/pool/case-studies');
              }
            }}
          >
            Delete
          </Button>
        )}
        <Button variant="secondary" onClick={() => go('/pool/case-studies')}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!canSave}>
          Save case study
        </Button>
      </footer>
    </div>
  );
}
