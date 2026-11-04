import { useMemo, useRef, useState, type DragEvent } from 'react';
import { Icon, icons } from '../components/icons';
import { Button, Field, SelectBox, Tag, TextArea, TextBox } from '../components/ui';
import { api } from '../lib/api';
import { formatBytes } from '../lib/format';
import { go } from '../lib/router';
import { useStore } from '../lib/store';
import type { MatchRequest, MatchResult } from '../lib/types';

type Mode = 'paste' | 'upload' | 'pool';
const ACCEPT = '.pdf,.txt,.md';
const MAX_BYTES = 30 * 1024 * 1024;
// Keeps the last result while people open a case study and come back.
const SAVED_KEY = 'match:last';

function loadSaved(): MatchResult | null {
  try {
    const raw = sessionStorage.getItem(SAVED_KEY);
    return raw ? (JSON.parse(raw) as MatchResult) : null;
  } catch {
    return null;
  }
}

export function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function MatchBrief() {
  const { items, caseStudies } = useStore();
  const [mode, setMode] = useState<Mode>('paste');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [itemId, setItemId] = useState('');
  const [count, setCount] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<MatchResult | null>(loadSaved);
  const inputRef = useRef<HTMLInputElement>(null);

  // Briefs already in the pool that Claude can read: RFPs and BD notes stored as PDF or text, or written notes.
  const poolBriefs = useMemo(
    () =>
      items.filter(
        (i) =>
          (i.docType === 'RFP' || i.docType === 'BD notes' || i.docType === 'Context note') &&
          (i.kind === 'context' || (i.hasFile && /\.(pdf|txt|md)$/i.test(i.name))),
      ),
    [items],
  );
  const briefLabel = (id: string) => poolBriefs.find((i) => i.id === id)?.title ?? '';

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_BYTES) return setError(`“${f.name}” is over 30 MB.`);
    if (!/\.(pdf|txt|md)$/i.test(f.name)) return setError('Use a PDF or text file. For Word or PowerPoint, paste the text instead.');
    setError('');
    setFile(f);
  };

  const ready = (mode === 'paste' && text.trim()) || (mode === 'upload' && file) || (mode === 'pool' && itemId);

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const req: MatchRequest = { text: mode === 'paste' ? text : '', count: Number(count) || undefined };
      if (mode === 'upload' && file) req.file = await api.briefFile(file, toBase64);
      if (mode === 'pool') req.itemId = itemId;
      const r = await api.match(req);
      setResult(r);
      try {
        sessionStorage.setItem(SAVED_KEY, JSON.stringify(r));
      } catch {
        /* storage unavailable; the result still shows */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const titleFor = (id: string, fallback: string) => caseStudies.find((c) => c.id === id)?.title ?? fallback;
  const exists = (id: string) => caseStudies.some((c) => c.id === id);

  return (
    <div className="page">
      <header className="page-header">
        <div className="crumbs">
          <button type="button" className="link-quiet" onClick={() => go('/proposals')}>
            Proposals
          </button>
          &nbsp;&nbsp;/&nbsp;&nbsp;Find case studies
        </div>
        <h1>Find case studies for a brief</h1>
      </header>

      <div className="page-body">
        <div className="page-main">
          <section className="card">
            <div className="card-head">
              <h2>Brief or RFP</h2>
              <div className="flex-1" />
              <div className="segmented" role="tablist">
                {(
                  [
                    ['paste', 'Paste text'],
                    ['upload', 'Upload file'],
                    ['pool', 'From knowledge pool'],
                  ] as [Mode, string][]
                ).map(([m, label]) => (
                  <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? 'is-active' : ''} onClick={() => setMode(m)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'paste' && (
              <TextArea value={text} rows={10} placeholder="Paste the brief, RFP, ITQ or tender text, including any annexes or Q&A." onChange={setText} />
            )}

            {mode === 'upload' &&
              (file ? (
                <div className="match-file">
                  <Icon src={icons.upload} size={20} />
                  <span className="flex-1">
                    {file.name} <span className="hint">· {formatBytes(file.size)}</span>
                  </span>
                  <Button variant="ghost" onClick={() => setFile(null)}>
                    Remove
                  </Button>
                </div>
              ) : (
                <div
                  className={`dropzone${dragging ? ' is-dragging' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e: DragEvent) => {
                    e.preventDefault();
                    setDragging(false);
                    pickFile(e.dataTransfer.files[0]);
                  }}
                  onClick={() => inputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
                >
                  <Icon src={icons.upload} size={24} />
                  <div className="dropzone-title">
                    Drag a brief here or <span className="u">browse</span>
                  </div>
                  <div className="dropzone-hint">PDF or text, up to 30 MB. For Word or PowerPoint, paste the text instead.</div>
                  <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPT}
                    hidden
                    onChange={(e) => {
                      pickFile(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </div>
              ))}

            {mode === 'pool' &&
              (poolBriefs.length ? (
                <Field label="RFP or notes">
                  <SelectBox
                    value={briefLabel(itemId)}
                    placeholder="Choose a brief"
                    options={poolBriefs.map((i) => i.title)}
                    onChange={(t) => setItemId(poolBriefs.find((i) => i.title === t)?.id ?? '')}
                  />
                </Field>
              ) : (
                <div className="placeholder">
                  <p className="placeholder-title">No readable briefs in the pool</p>
                  <p className="hint">RFPs and BD notes saved as PDF or text, and written context notes, appear here.</p>
                </div>
              ))}

            <div className="row-end">
              <Field label="How many case studies (optional)" className="match-count">
                <TextBox value={count} inputMode="numeric" placeholder="3 to 5" onChange={(v) => setCount(v.replace(/\D/g, ''))} />
              </Field>
              <div className="flex-1" />
              <Button onClick={run} disabled={!ready || busy}>
                {busy ? 'Finding matches…' : 'Find case studies'}
              </Button>
            </div>
            {busy && <p className="hint">Claude is reading the brief and the library. This usually takes under a minute.</p>}
            {error && <p className="error-text">{error}</p>}
          </section>

          {result && !busy && <Results result={result} titleFor={titleFor} exists={exists} />}
        </div>

        <aside className="page-side">
          <section className="card card-muted">
            <h3>How matching works</h3>
            <p className="hint lh-18">
              Case studies are ranked by project type first, then sector. Ties go to the closest fit with the brief’s users, platform and regulations, then
              verified results, then recency. Only case studies in this knowledge pool are considered; past proposals are listed separately, never shortlisted.
            </p>
            <p className="hint lh-18">
              The rules live in <code>skills/psykhe-case-study-curation/SKILL.md</code>. Edit that file to change them.
            </p>
          </section>
          <section className="card card-muted">
            <h3>What gets sent</h3>
            <p className="hint lh-18">
              The brief and a summary of each case study ({caseStudies.length} now) go to Claude. Remove NRIC or FIN numbers, phone numbers and bank details first.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

export function Results({
  result,
  titleFor,
  exists,
}: {
  result: MatchResult;
  titleFor: (id: string, fallback: string) => string;
  exists: (id: string) => boolean;
}) {
  if (result.status === 'needs_input') {
    return (
      <section className="card">
        <h2>Claude needs more before ranking</h2>
        <p className="lh-18">{result.question}</p>
      </section>
    );
  }

  return (
    <>
      {result.briefProfile.length > 0 && (
        <section className="card">
          <h2>Brief profile</h2>
          <dl className="match-profile">
            {result.briefProfile.map((p, i) => (
              <div key={i}>
                <dt>{p.label}</dt>
                <dd>
                  {p.value}
                  {p.clause && <span className="hint"> · {p.clause}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <h2 className="section-title">
        {result.shortlist.length ? `Shortlist · ${result.shortlist.length}` : 'No case studies match this brief'}
      </h2>
      {result.shortlist.map((s) => (
        <section key={s.caseStudyId + s.rank} className="card match-card">
          <div className="card-head">
            <span className="match-rank">{s.rank}</span>
            {exists(s.caseStudyId) ? (
              <button type="button" className="match-title link-quiet" onClick={() => go(`/case-studies/${s.caseStudyId}`)}>
                {titleFor(s.caseStudyId, s.title)}
              </button>
            ) : (
              <span className="match-title">{s.title}</span>
            )}
            <div className="flex-1" />
            <Tag>{s.namingStatus}</Tag>
          </div>
          <div className="match-levels">
            <span className="match-level">
              <b>{s.projectTypeMatch}</b> project type · {s.projectTypeReason}
            </span>
            <span className="match-level">
              <b>{s.sectorMatch}</b> sector
            </span>
          </div>
          <p className="lh-18">{s.why}</p>
          {s.flags.length > 0 && (
            <ul className="match-flags">
              {s.flags.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <ListCard title="Considered but not shortlisted" rows={result.notShortlisted.map((n) => [titleFor(n.caseStudyId, n.title), n.reason])} />
      <ListCard
        title="Relevant work with no approved case study"
        rows={result.uncoveredWork.map((w) => [w.title, `${w.why}${w.recommendWriteUp ? ' Worth writing up.' : ''}`])}
      />
      <ListCard title="Gaps" rows={result.gaps.map((g) => ['', g])} />
      <ListCard
        title="How Claude classified case studies"
        rows={result.classifications.map((c) => [titleFor(c.caseStudyId, c.title), [c.workType, c.surface, c.sector, c.year, c.status].filter(Boolean).join(' · ')])}
      />
    </>
  );
}

function ListCard({ title, rows }: { title: string; rows: [string, string][] }) {
  if (!rows.length) return null;
  return (
    <section className="card">
      <h2>{title}</h2>
      <ul className="match-list">
        {rows.map(([head, body], i) => (
          <li key={i}>
            {head && <b>{head}: </b>}
            {body}
          </li>
        ))}
      </ul>
    </section>
  );
}
