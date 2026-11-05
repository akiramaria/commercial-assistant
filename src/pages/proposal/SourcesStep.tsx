import { useMemo, useRef, useState, type DragEvent } from 'react';
import { Icon, icons } from '../../components/icons';
import { Checkbox, ComboBox, Field, Popover, SelectBox, TextArea, TextBox } from '../../components/ui';
import { api } from '../../lib/api';
import { fileKind, formatBytes, uid } from '../../lib/format';
import { SERVICE_LINES } from '../../lib/options';
import { MAX_SOURCE_BYTES, SOURCE_ACCEPT, SOURCE_TAGS, guessTag, readableSource } from '../../lib/proposals';
import { useStore } from '../../lib/store';
import type { Proposal, ProposalSource } from '../../lib/types';

interface Props {
  p: Proposal;
  update: (change: Partial<Proposal> | ((cur: Proposal) => Partial<Proposal>)) => void;
  save: (next?: Proposal) => Promise<Proposal | undefined>;
  /** Wraps each upload so the page can hold "Analyse sources" until files are stored. */
  track: (fileId: string, upload: Promise<unknown>) => Promise<unknown>;
  uploading: Set<string>;
}

export function SourcesStep({ p, update, save, track, uploading }: Props) {
  const { items, caseStudies, notify } = useStore();
  const clients = useMemo(
    () => [...new Set([...items.map((i) => i.client), ...caseStudies.map((c) => c.client)].filter(Boolean))].sort(),
    [items, caseStudies],
  );

  // Files are listed on the saved proposal first (the server only accepts uploads it knows about), then uploaded.
  const addFiles = async (files: File[], group: ProposalSource['group']) => {
    const ok: { source: ProposalSource; file: File }[] = [];
    for (const file of files) {
      if (group === 'logo' ? !file.type.startsWith('image/') : !readableSource(file.name)) {
        notify(
          group === 'logo'
            ? `“${file.name}” isn’t an image.`
            : /\.(doc|ppt)$/i.test(file.name)
              ? `Save “${file.name}” as .${file.name.endsWith('doc') ? 'docx' : 'pptx'} first, then add it.`
              : `“${file.name}” can’t be read. Use PDF, Word (.docx), PowerPoint (.pptx) or text.`,
        );
        continue;
      }
      if (file.size > MAX_SOURCE_BYTES) {
        notify(`“${file.name}” is over 50 MB.`);
        continue;
      }
      const source: ProposalSource = {
        id: `s-${uid()}`,
        group,
        name: file.name,
        size: file.size,
        mime: file.type,
        tag: group === 'logo' ? 'Logo' : guessTag(file.name, group),
      };
      ok.push({ source, file });
    }
    if (!ok.length) return;
    // A client has one logo: a new one replaces the old.
    const kept = group === 'logo' ? p.sources.filter((s) => s.group !== 'logo') : p.sources;
    const next = { ...p, sources: [...kept, ...ok.map((o) => o.source)] };
    update({ sources: next.sources });
    try {
      await save(next);
    } catch {
      notify('Couldn’t save the proposal, so the files weren’t added.');
      return;
    }
    for (const { source, file } of ok) {
      track(source.id, api.uploadSource(p.id, source.id, file)).catch(() => {
        notify(`“${file.name}” didn’t upload. Try adding it again.`);
        update((cur) => ({ sources: cur.sources.filter((s) => s.id !== source.id) }));
      });
    }
  };

  const remove = (id: string) => update((cur) => ({ sources: cur.sources.filter((s) => s.id !== id) }));
  const retag = (id: string, tag: string) => update((cur) => ({ sources: cur.sources.map((s) => (s.id === id ? { ...s, tag } : s)) }));
  const rfp = p.sources.filter((s) => s.group === 'rfp');
  const notes = p.sources.filter((s) => s.group === 'notes');
  const logo = p.sources.find((s) => s.group === 'logo');

  return (
    <div className="flow-body">
      <div className="flow-intro">
        <h2>Add your sources</h2>
        <p>Upload the RFP or brief and add your notes. The assistant reads everything before shaping the scope, timeline and budget.</p>
      </div>
      <div className="flow-cols">
        <div className="flow-col-left">
          <section className="card">
            <h3 className="card-title">Opportunity</h3>
            <Field label="Proposal title">
              <TextBox value={p.title} placeholder="e.g. Mobile onboarding UT and redesign" onChange={(title) => update({ title })} />
            </Field>
            <Field label="Submission deadline">
              <div className="box">
                <input type="datetime-local" value={p.deadline} onChange={(e) => update({ deadline: e.target.value })} />
              </div>
            </Field>
            <Field label="HubSpot deal (optional)">
              <TextBox value={p.hubspotDeal} placeholder="Deal name" onChange={(hubspotDeal) => update({ hubspotDeal })} />
            </Field>
            <Field label="Service line">
              <SelectBox value={p.serviceLine} options={SERVICE_LINES} placeholder="Choose a service line" onChange={(serviceLine) => update({ serviceLine })} />
            </Field>
            <div className="radio-group" role="radiogroup" aria-label="What does the client need?">
              <span className="field-label">What does the client need?</span>
              {(
                [
                  ['full', 'Full proposal', 'Scope, timeline, budget and a drafted deck'],
                  ['pricing', 'Quick pricing only', 'A price for a third quote, no deck'],
                ] as const
              ).map(([value, label, hint]) => (
                <button key={value} type="button" role="radio" aria-checked={p.need === value} className="radio" onClick={() => update({ need: value })}>
                  <Icon src={p.need === value ? icons.radioOn : icons.radioOff} size={16} />
                  <span className="radio-text">
                    <span className="radio-label">{label}</span>
                    <span className="radio-hint">{hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="card">
            <h3 className="card-title">Client information</h3>
            <Field label="Client">
              <ComboBox value={p.client} options={clients} placeholder="Choose or type a client" onChange={(client) => update({ client })} />
            </Field>
            <LogoRow logo={logo} uploading={logo ? uploading.has(logo.id) : false} onPick={(f) => addFiles([f], 'logo')} onRemove={() => logo && remove(logo.id)} />
            <Checkbox
              checked={p.includeSectorSlide}
              onChange={(includeSectorSlide) => update({ includeSectorSlide })}
              label={`Include the ${p.sector || 'sector'} slide from the BD deck`}
            />
          </section>
        </div>

        <div className="flow-col-right">
          <section className="card">
            <div className="card-head">
              <h3 className="card-title">RFP and brief</h3>
              <div className="flex-1" />
              {rfp.length > 0 && (
                <span className="hint">
                  {rfp.length} file{rfp.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <Drop onFiles={(f) => addFiles(f, 'rfp')} />
            {rfp.map((s) => (
              <SourceRow key={s.id} s={s} uploading={uploading.has(s.id)} onRemove={() => remove(s.id)} onTag={(t) => retag(s.id, t)} />
            ))}
          </section>

          <section className="card">
            <h3 className="card-title">BD notes</h3>
            <Drop onFiles={(f) => addFiles(f, 'notes')} />
            {notes.map((s) => (
              <SourceRow key={s.id} s={s} uploading={uploading.has(s.id)} onRemove={() => remove(s.id)} onTag={(t) => retag(s.id, t)} />
            ))}
            <Field label="Paste notes from calls, emails or the pre-sales briefing">
              <TextArea
                value={p.notes}
                rows={3}
                placeholder="e.g. Client wants to cut drop-off in app onboarding. Evaluation is 70% quality, 30% price. Decision maker is the Head of Digital."
                onChange={(notes) => update({ notes })}
              />
            </Field>
          </section>
        </div>
      </div>
    </div>
  );
}

function Drop({ onFiles }: { onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={`dropzone dropzone-sm${dragging ? ' is-dragging' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        setDragging(false);
        onFiles([...e.dataTransfer.files]);
      }}
    >
      <Icon src={icons.upload} size={24} />
      <div className="dropzone-title">Drag files here or browse</div>
      <div className="dropzone-hint">RFP, ITQ, brief, addendum or briefing notes. PDF, Word or PowerPoint, up to 50 MB.</div>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={SOURCE_ACCEPT}
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function SourceRow({ s, uploading, onRemove, onTag }: { s: ProposalSource; uploading: boolean; onRemove: () => void; onTag: (tag: string) => void }) {
  return (
    <div className="source-row">
      <Icon src={icons.file18} size={18} />
      <div className="source-text">
        <span className="source-name">{s.name}</span>
        <span className="source-meta">{uploading ? 'Uploading…' : `${fileKind(s.name)} · ${formatBytes(s.size)}`}</span>
      </div>
      <Popover
        align="right"
        trigger={(_, toggle) => (
          <button type="button" className="tag tag-btn" onClick={toggle} aria-label={`File type: ${s.tag}. Change`}>
            {s.tag}
          </button>
        )}
      >
        {(close) => (
          <div className="menu">
            {SOURCE_TAGS.map((t) => (
              <button
                key={t}
                type="button"
                className="menu-item"
                onClick={() => {
                  onTag(t);
                  close();
                }}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </Popover>
      <button type="button" className="icon-btn" onClick={onRemove} aria-label={`Remove ${s.name}`}>
        <Icon src={icons.x} size={16} />
      </button>
    </div>
  );
}

function LogoRow({ logo, uploading, onPick, onRemove }: { logo?: ProposalSource; uploading: boolean; onPick: (f: File) => void; onRemove: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="logo-row">
      <div className="logo-box">Logo</div>
      <div className="logo-text">
        <span className="logo-title">{logo ? logo.name : 'No logo yet'}</span>
        <span className="logo-hint">{uploading ? 'Uploading…' : logo ? `${formatBytes(logo.size)} · used on the cover` : 'Add the client’s logo for the cover'}</span>
      </div>
      {logo && !uploading && (
        <button type="button" className="icon-btn" onClick={onRemove} aria-label="Remove logo">
          <Icon src={icons.x} size={16} />
        </button>
      )}
      <button type="button" className="btn btn-ghost" onClick={() => input.current?.click()}>
        {logo ? 'Replace' : 'Add'}
      </button>
      <input
        ref={input}
        type="file"
        hidden
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
