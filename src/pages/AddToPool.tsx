import { useRef, useState, type DragEvent } from 'react';
import { useOptions, useStore } from '../lib/store';
import { go } from '../lib/router';
import { FIELD_LABELS, missingTags, type PoolItem } from '../lib/types';
import { fileKind, formatBytes, uid, wordCount } from '../lib/format';
import { suggestTags, titleFromFileName } from '../lib/suggest';
import { tabForDocType } from '../lib/options';
import { Button, ComboBox, Field, Tag, TextArea, TextBox } from '../components/ui';
import { Icon, icons } from '../components/icons';
import { ItemFields, tagSummary } from '../components/ItemFields';

const MAX_BYTES = 50 * 1024 * 1024;
const ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.key,.xls,.xlsx,.csv,.txt,.md';

interface Draft extends PoolItem {
  file?: File;
  expanded: boolean;
  suggested: string[];
}

type Mode = 'upload' | 'context' | 'sharepoint';

function blankItem(): PoolItem {
  return {
    id: uid(),
    kind: 'file',
    name: '',
    title: '',
    docType: '',
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
    addedAt: new Date().toISOString(),
  };
}

export function AddToPool() {
  const { items, addItems, notify } = useStore();
  const opts = useOptions();
  const [mode, setMode] = useState<Mode>('upload');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const [ctxTitle, setCtxTitle] = useState('');
  const [ctxBody, setCtxBody] = useState('');
  const [bulk, setBulk] = useState({ client: '', projectType: '', sector: '', serviceLine: '' });
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const ready = drafts.filter((d) => missingTags(d).length === 0);
  const needTags = drafts.length - ready.length;

  const addFiles = (files: FileList | File[]) => {
    const tooBig: string[] = [];
    const next: Draft[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) {
        tooBig.push(file.name);
        continue;
      }
      const s = suggestTags(file.name, items);
      const d: Draft = {
        ...blankItem(),
        ...s,
        kind: 'file',
        name: file.name,
        title: titleFromFileName(file.name),
        size: file.size,
        mime: file.type,
        file,
        suggested: Object.keys(s),
        expanded: false,
      };
      next.push(d);
    }
    setRejected(tooBig);
    setDrafts((cur) => {
      const all = [...cur, ...next];
      // Open the first item that still needs tags so people know where to start.
      const firstMissing = all.find((d) => missingTags(d).length > 0);
      return all.map((d) => ({ ...d, expanded: d.expanded || (d === firstMissing && !cur.some((c) => c.expanded)) }));
    });
  };

  const addContext = () => {
    if (!ctxTitle.trim() || !ctxBody.trim()) return;
    const d: Draft = {
      ...blankItem(),
      kind: 'context',
      docType: 'Context note',
      name: ctxTitle.trim(),
      title: ctxTitle.trim(),
      body: ctxBody.trim(),
      suggested: [],
      expanded: true,
    };
    setDrafts((cur) => [...cur.map((c) => ({ ...c, expanded: false })), d]);
    setCtxTitle('');
    setCtxBody('');
  };

  const patch = (id: string, p: Partial<Draft>) => setDrafts((cur) => cur.map((d) => (d.id === id ? { ...d, ...p } : d)));

  // Fills blanks only, so suggested or hand-entered tags aren't overwritten.
  const applyBulk = () => {
    const set = Object.entries(bulk).filter(([, v]) => v.trim()) as [keyof typeof bulk, string][];
    if (!set.length) return;
    const fill = (d: Draft) => {
      const p: Partial<Draft> = {};
      for (const [k, v] of set) if (!d[k].trim()) p[k] = v;
      return p;
    };
    const changed = drafts.filter((d) => Object.keys(fill(d)).length).length;
    setDrafts((cur) => cur.map((d) => ({ ...d, ...fill(d) })));
    notify(changed ? `Filled blank tags in ${changed} item${changed === 1 ? '' : 's'}.` : 'Every item already has those tags.');
  };

  const submit = async () => {
    if (!ready.length) return;
    setSaving(true);
    const files = new Map(ready.filter((d) => d.file).map((d) => [d.id, d.file!]));
    try {
      await addItems(
        ready.map(({ file: _f, expanded: _e, suggested: _s, ...item }) => ({
          ...item,
          title: item.title || titleFromFileName(item.name),
        })),
        files,
      );
    } catch (e) {
      setSaving(false);
      notify(e instanceof Error ? e.message : 'Couldn’t save to the server.');
      return;
    }
    setSaving(false);
    notify(`Added ${ready.length} item${ready.length === 1 ? '' : 's'} to the knowledge pool.`);
    const remaining = drafts.filter((d) => !ready.includes(d));
    if (remaining.length) {
      setDrafts(remaining.map((d, n) => ({ ...d, expanded: n === 0 })));
    } else {
      go(`/pool/${tabForDocType(ready[0].docType)}`);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  return (
    <div className="page">
      <header className="page-header">
        <div className="crumbs">
          <button type="button" className="link-quiet" onClick={() => go('/pool/proposals')}>
            Knowledge pool
          </button>
          &nbsp;&nbsp;/&nbsp;&nbsp;Add
        </div>
        <h1>Add to knowledge pool</h1>
      </header>

      <div className="page-body">
        <div className="page-main">
          <section className="card">
            <div className="card-head">
              <h2>Add files or context</h2>
              <div className="flex-1" />
              <div className="segmented" role="tablist">
                {(
                  [
                    ['upload', 'Upload files'],
                    ['context', 'Write context'],
                    ['sharepoint', 'From SharePoint'],
                  ] as [Mode, string][]
                ).map(([m, label]) => (
                  <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? 'is-active' : ''} onClick={() => setMode(m)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'upload' && (
              <>
                <div
                  className={`dropzone${dragging ? ' is-dragging' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  onClick={() => inputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
                >
                  <Icon src={icons.upload} size={24} />
                  <div className="dropzone-title">
                    Drag files here or <span className="u">browse</span>
                  </div>
                  <div className="dropzone-hint">Proposals, case studies, closure reports or RFPs. PDF, Word or PowerPoint, up to 50 MB each.</div>
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept={ACCEPT}
                    hidden
                    onChange={(e) => {
                      if (e.target.files) addFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </div>
                {rejected.length > 0 && <p className="error-text">Over 50 MB, not added: {rejected.join(', ')}</p>}
                <p className="hint">Tags are suggested from the file name and similar items in the pool. Check them before adding.</p>
              </>
            )}

            {mode === 'context' && (
              <div className="stack-12">
                <Field label="Title">
                  <TextBox value={ctxTitle} placeholder="e.g. Lessons from the Harbour onboarding project" onChange={setCtxTitle} />
                </Field>
                <Field label="Context">
                  <TextArea
                    value={ctxBody}
                    rows={6}
                    placeholder="What should the assistant know? Client preferences, what worked, pricing notes…"
                    onChange={setCtxBody}
                  />
                </Field>
                <div className="row-end">
                  <span className="hint">{wordCount(ctxBody)} words</span>
                  <div className="flex-1" />
                  <Button variant="secondary" disabled={!ctxTitle.trim() || !ctxBody.trim()} onClick={addContext}>
                    Add to list
                  </Button>
                </div>
              </div>
            )}

            {mode === 'sharepoint' && (
              <div className="placeholder">
                <p className="placeholder-title">SharePoint isn’t connected</p>
                <p className="hint">Connecting a SharePoint library needs an admin to set it up. Upload files directly for now.</p>
              </div>
            )}
          </section>

          {drafts.length > 0 && (
            <>
              <h2 className="section-title">
                {drafts.length} item{drafts.length === 1 ? '' : 's'} to add
              </h2>
              {drafts.map((d) => (
                <DraftCard
                  key={d.id}
                  draft={d}
                  onChange={(p) => patch(d.id, p)}
                  onToggle={() => patch(d.id, { expanded: !d.expanded })}
                  onRemove={() => setDrafts((cur) => cur.filter((x) => x.id !== d.id))}
                />
              ))}
            </>
          )}
        </div>

        {drafts.length > 0 && (
          <aside className="page-side">
            {drafts.length > 1 && (
              <section className="card">
                <h2>Tag several items at once</h2>
                <Field label="Client">
                  <ComboBox value={bulk.client} options={opts.clients} onChange={(client) => setBulk({ ...bulk, client })} />
                </Field>
                <Field label="Project type">
                  <ComboBox value={bulk.projectType} options={opts.projectTypes} onChange={(projectType) => setBulk({ ...bulk, projectType })} />
                </Field>
                <Field label="Sector">
                  <ComboBox value={bulk.sector} options={opts.sectors} onChange={(sector) => setBulk({ ...bulk, sector })} />
                </Field>
                <Field label="Service line">
                  <ComboBox value={bulk.serviceLine} options={opts.serviceLines} onChange={(serviceLine) => setBulk({ ...bulk, serviceLine })} />
                </Field>
                <Button variant="secondary" className="w-full" onClick={applyBulk} disabled={!Object.values(bulk).some((v) => v.trim())}>
                  Fill blanks in all {drafts.length} items
                </Button>
                <p className="hint">Only empty fields are filled. Tags already set on an item are kept.</p>
              </section>
            )}
            <section className="card card-muted">
              <h3>Required tags</h3>
              <p className="hint lh-18">Document type, project type, sector, service line and client. Everything else is optional and can be added later.</p>
            </section>
          </aside>
        )}
      </div>

      <footer className="page-footer">
        <span>
          {drafts.length === 0
            ? 'No items yet'
            : `${drafts.length} item${drafts.length === 1 ? '' : 's'}${needTags ? ` · ${needTags} need${needTags === 1 ? 's' : ''} tags before ${needTags === 1 ? 'it' : 'they'} can be added` : ' · ready to add'}`}
        </span>
        <div className="flex-1" />
        <Button variant="secondary" onClick={() => go('/pool/proposals')}>
          Back to knowledge pool
        </Button>
        <Button onClick={submit} disabled={!ready.length || saving}>
          {saving ? 'Adding…' : `Add ${ready.length} item${ready.length === 1 ? '' : 's'}`}
        </Button>
      </footer>
    </div>
  );
}

function DraftCard({
  draft,
  onChange,
  onToggle,
  onRemove,
}: {
  draft: Draft;
  onChange: (p: Partial<Draft>) => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const missing = missingTags(draft);
  const meta =
    draft.kind === 'file'
      ? [fileKind(draft.name), formatBytes(draft.size), 'Ready to upload'].join(' · ')
      : `Written by ${draft.addedBy} · ${wordCount(draft.body)} words`;

  return (
    <section className={`card item-card${draft.expanded ? ' is-expanded' : ''}`}>
      <div className="item-head" onClick={onToggle}>
        <Icon src={draft.kind === 'context' ? icons.message : icons.file20} size={20} />
        <div className="flex-1 min-w-0">
          <div className="item-name">{draft.kind === 'context' ? `Context: ${draft.title}` : draft.name}</div>
          <div className="item-meta">{meta}</div>
          {!draft.expanded &&
            (missing.length ? (
              <div className="item-missing">Needs {missing.map((m) => FIELD_LABELS[m].toLowerCase()).join(', ')}</div>
            ) : (
              <div className="item-summary">{tagSummary(draft)}</div>
            ))}
        </div>
        {!draft.expanded && missing.length === 0 && draft.docType && <Tag>{draft.docType}</Tag>}
        <button type="button" className="icon-btn" aria-label={draft.expanded ? 'Collapse' : 'Expand'} aria-expanded={draft.expanded}>
          <Icon src={icons.chevronCard} size={16} className={draft.expanded ? 'rot-180' : ''} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Remove from list"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Icon src={icons.x} size={16} />
        </button>
      </div>

      {draft.expanded && (
        <div className="item-body">
          {draft.suggested.length > 0 && (
            <div className="banner">
              <Icon src={icons.sparkle} size={14} />
              <span>Some tags were suggested from the file name and similar items. Check them before adding.</span>
            </div>
          )}
          <Field label="Title">
            <TextBox value={draft.title} onChange={(title) => onChange({ title })} />
          </Field>
          {draft.kind === 'context' && (
            <Field label="Context">
              <TextArea value={draft.body ?? ''} rows={5} onChange={(body) => onChange({ body })} />
            </Field>
          )}
          <ItemFields value={draft} onChange={onChange} />
        </div>
      )}
    </section>
  );
}
