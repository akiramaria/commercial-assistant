import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { missingTags, type PoolItem } from '../lib/types';
import { fileKind, formatBytes, monthYear } from '../lib/format';
import { downloadFile } from '../lib/files';
import { tabForDocType } from '../lib/options';
import { go } from '../lib/router';
import { Button, Field, TextArea, TextBox } from '../components/ui';
import { Icon, icons } from '../components/icons';
import { ItemFields } from '../components/ItemFields';

/** Side panel for viewing and retagging an item that's already in the pool. */
export function ItemDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { items, updateItem, removeItem, notify, caseStudies } = useStore();
  const original = items.find((i) => i.id === id);
  const [draft, setDraft] = useState<PoolItem | undefined>(original);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!original || !draft) return null;
  const missing = missingTags(draft);
  const usedIn = caseStudies.filter((c) => c.sourceIds.includes(id));
  const patch = (p: Partial<PoolItem>) => setDraft({ ...draft, ...p });

  const save = async () => {
    if (!(await updateItem(id, draft))) return;
    notify('Tags saved.');
    onClose();
    const tab = tabForDocType(draft.docType);
    if (tab !== tabForDocType(original.docType)) go(`/pool/${tab}`);
  };

  return (
    <div className="drawer-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-label={`Edit ${draft.title}`}>
        <header className="drawer-header">
          <Icon src={draft.kind === 'context' ? icons.message : icons.file20} size={20} />
          <div className="flex-1 min-w-0">
            <div className="item-name">{draft.name}</div>
            <div className="item-meta">
              {draft.kind === 'file'
                ? [fileKind(draft.name), formatBytes(draft.size), `Added ${monthYear(draft.addedAt)} by ${draft.addedBy}`].filter(Boolean).join(' · ')
                : `Written by ${draft.addedBy} · ${monthYear(draft.addedAt)}`}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon src={icons.x} size={16} />
          </button>
        </header>

        <div className="drawer-body">
          <Field label="Title">
            <TextBox value={draft.title} onChange={(title) => patch({ title })} />
          </Field>
          {draft.kind === 'context' && (
            <Field label="Context">
              <TextArea value={draft.body ?? ''} rows={6} onChange={(body) => patch({ body })} />
            </Field>
          )}
          <ItemFields value={draft} onChange={patch} />
          {usedIn.length > 0 && (
            <div className="note">
              Used in {usedIn.length === 1 ? 'case study' : `${usedIn.length} case studies`}:{' '}
              {usedIn.map((c, n) => (
                <span key={c.id}>
                  {n > 0 && ', '}
                  <button type="button" className="link" onClick={() => go(`/case-studies/${c.id}`)}>
                    {c.title}
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <footer className="drawer-footer">
          <Button
            variant="danger"
            onClick={() => {
              if (confirm(`Remove “${draft.title}” from the knowledge pool?`)) {
                removeItem(id);
                notify('Removed from the knowledge pool.');
                onClose();
              }
            }}
          >
            Remove
          </Button>
          {draft.kind === 'file' && (
            <Button
              variant="secondary"
              onClick={() => {
                if (original.hasFile) downloadFile(id, draft.name);
                else notify(draft.sample ? 'Sample rows have no file attached.' : 'No file is stored for this item.');
              }}
            >
              Download
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={missing.length > 0} title={missing.length ? 'Fill in the required tags first' : undefined}>
            Save tags
          </Button>
        </footer>
      </aside>
    </div>
  );
}
