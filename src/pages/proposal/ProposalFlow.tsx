import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui';
import { api } from '../../lib/api';
import { STEP_NUMBER, dueLabel, savedLabel } from '../../lib/proposals';
import { go } from '../../lib/router';
import { useStore } from '../../lib/store';
import type { Proposal } from '../../lib/types';
import { BriefStep } from './BriefStep';
import { GapsStep } from './GapsStep';
import { SourcesStep } from './SourcesStep';
import { Working } from './Working';

// Creating a proposal, built from the Figma frames "02 Add sources" to "05 Gaps & assumptions".
// The proposal is saved as it's edited; the Claude steps run on the server and are saved there,
// so people can leave while one runs and come back to the result.

type View = 'sources' | 'brief' | 'gaps';
const STEPS = ['Sources', 'Brief & approach', 'Gaps & assumptions', 'Draft'];
const SAVE_DELAY = 800;
const POLL_MS = 4000;

export function ProposalFlow({ id, view: requested }: { id: string; view?: string }) {
  const { notify } = useStore();
  const [p, setP] = useState<Proposal | null>(null);
  const [missing, setMissing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [, tick] = useState(0);
  // Ids of files still uploading.
  const [uploading, setUploading] = useState<Set<string>>(new Set());
  const abort = useRef<AbortController | null>(null);
  const latest = useRef<Proposal | null>(null);
  latest.current = p;

  useEffect(() => {
    api.getProposal(id).then(setP, () => setMissing(true));
  }, [id]);

  // Keep "Saved 2 min ago" current.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const save = useCallback(async (next?: Proposal) => {
    const body = next ?? latest.current;
    if (!body) return;
    setSaving(true);
    try {
      const saved = await api.saveProposal(body);
      // Keep edits made while the save was in flight.
      setP((cur) => (cur && cur !== body ? { ...cur, updatedAt: saved.updatedAt } : saved));
      if (latest.current === body) setDirty(false);
      return saved;
    } finally {
      setSaving(false);
    }
  }, []);

  const update = useCallback((change: Partial<Proposal> | ((cur: Proposal) => Partial<Proposal>)) => {
    setP((cur) => (cur ? { ...cur, ...(typeof change === 'function' ? change(cur) : change) } : cur));
    setDirty(true);
  }, []);

  const running = Boolean(p?.runId);

  const track = useCallback((fileId: string, upload: Promise<unknown>) => {
    setUploading((s) => new Set(s).add(fileId));
    return upload.finally(() =>
      setUploading((s) => {
        const next = new Set(s);
        next.delete(fileId);
        return next;
      }),
    );
  }, []);

  // Autosave edits, except while Claude is working on the proposal.
  useEffect(() => {
    if (!dirty || running) return;
    const t = setTimeout(() => save().catch(() => notify('Couldn’t save. Check your connection.')), SAVE_DELAY);
    return () => clearTimeout(t);
  }, [p, dirty, running, save, notify]);

  // If someone opens a proposal while a step runs (e.g. they left and came back), watch for the result.
  useEffect(() => {
    if (!running || abort.current) return;
    const t = setInterval(() => api.getProposal(id).then((fresh) => !fresh.runId && setP(fresh)), POLL_MS);
    return () => clearInterval(t);
  }, [running, id]);

  const run = async (kind: 'analyse' | 'gaps') => {
    const current = latest.current;
    if (!current) return;
    if (dirty) await save();
    const controller = new AbortController();
    abort.current = controller;
    // Show the working screen straight away; the server records the run too.
    setP({ ...current, step: kind === 'analyse' ? 'analysing' : 'gaps', runId: 'starting', runStartedAt: new Date().toISOString(), runError: undefined });
    try {
      const result = kind === 'analyse' ? await api.analyseProposal(id) : await api.findGaps(id);
      if (controller.signal.aborted) return;
      setP(result);
      go(`/proposals/${id}/${kind === 'analyse' ? 'brief' : 'gaps'}`);
    } catch (e) {
      if (controller.signal.aborted) return;
      notify(e instanceof Error ? e.message : 'Something went wrong.');
      setP(await api.getProposal(id));
    } finally {
      if (abort.current === controller) abort.current = null;
    }
  };

  const cancel = async () => {
    const current = latest.current;
    if (!current) return;
    abort.current?.abort();
    abort.current = null;
    // Moving off the running step makes the server ignore the result when it arrives.
    const back = current.step === 'analysing' ? 'sources' : 'brief';
    const saved = await save({ ...current, step: back, runId: undefined, runStartedAt: undefined });
    go(`/proposals/${id}/${back}`);
    if (saved) setP(saved);
  };

  if (missing) {
    return (
      <div className="state-msg">
        <p className="placeholder-title">This proposal doesn’t exist any more</p>
        <Button variant="secondary" onClick={() => go('/proposals')}>
          Back to proposals
        </Button>
      </div>
    );
  }
  if (!p) return <div className="state-msg">Loading the proposal…</div>;

  // Which page to show: the one asked for in the address, if the proposal has reached it.
  const reached: View = p.questions.length ? 'gaps' : p.analysis ? 'brief' : 'sources';
  const order: View[] = ['sources', 'brief', 'gaps'];
  const view: View = order.includes(requested as View) && order.indexOf(requested as View) <= order.indexOf(reached) ? (requested as View) : p.step === 'gaps' || p.step === 'draft' ? reached : p.step === 'brief' ? 'brief' : 'sources';
  const showWorking = running && (p.step === 'analysing' || p.step === 'gaps');
  const current = showWorking ? STEP_NUMBER[p.step] : order.indexOf(view) + 1;
  const open = (v: View) => go(`/proposals/${id}/${v}`);
  const due = dueLabel(p.deadline);

  return (
    <div className="flow">
      <header className="flow-header">
        <div className="crumbs">
          <button type="button" className="link-quiet" onClick={() => go('/proposals')}>
            Proposals
          </button>
          {p.client && <>&nbsp;&nbsp;/&nbsp;&nbsp;{p.client}</>}
        </div>
        <div className="flow-title-row">
          <h1>{p.title || 'Untitled proposal'}</h1>
          <span className="pill">{showWorking ? 'Analysing' : 'Draft'}</span>
          {due && <span className="pill pill-outline">Due {due}</span>}
          <div className="flex-1" />
          <span className="flow-saved">{saving ? 'Saving…' : dirty ? 'Unsaved changes' : savedLabel(p.updatedAt)}</span>
          <Button variant="secondary" onClick={() => notify('Sharing isn’t built yet.')}>
            Share
          </Button>
        </div>
        <ol className="stepper">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const state = n < current ? 'done' : n === current ? 'current' : 'upcoming';
            const target = order[i];
            const canOpen = !showWorking && target && order.indexOf(target) <= order.indexOf(reached) && n !== current;
            return (
              <li key={label} className={`step step-${state}`}>
                {i > 0 && <span className="step-line" />}
                <button type="button" className="step-btn" disabled={!canOpen} onClick={() => open(target)}>
                  <span className="step-circle">{n}</span>
                  <span className="step-label">{label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </header>

      {showWorking ? (
        <Working p={p} kind={p.step === 'analysing' ? 'analyse' : 'gaps'} onCancel={cancel} onRetry={() => run(p.step === 'analysing' ? 'analyse' : 'gaps')} />
      ) : (
        <>
          {p.runError && (
            <div className="flow-error">
              <p>{p.runError}</p>
              <Button variant="ghost" onClick={() => update({ runError: undefined })}>
                Dismiss
              </Button>
            </div>
          )}
          {view === 'sources' && <SourcesStep p={p} update={update} save={save} track={track} uploading={uploading} />}
          {view === 'brief' && p.analysis && <BriefStep p={p} analysis={p.analysis} update={update} onViewSources={() => open('sources')} />}
          {view === 'gaps' && <GapsStep p={p} update={update} onCheckAgain={() => run('gaps')} />}

          <footer className="flow-footer">
            {view !== 'brief' && <span className="flow-step-count">Step {order.indexOf(view) + 1} of 4</span>}
            <div className="flex-1" />
            {view !== 'sources' && (
              <Button variant="ghost" onClick={() => open(view === 'gaps' ? 'brief' : 'sources')}>
                Back
              </Button>
            )}
            <Button variant="secondary" disabled={saving} onClick={() => save().then(() => notify('Draft saved.'))}>
              Save draft
            </Button>
            {view === 'sources' && <SourcesActions p={p} uploading={uploading.size > 0} onAnalyse={() => run('analyse')} onContinue={() => open('brief')} />}
            {view === 'brief' && (
              <Button onClick={() => (p.questions.length ? open('gaps') : run('gaps'))}>Continue to gaps &amp; assumptions</Button>
            )}
            {view === 'gaps' && <Button onClick={() => notify('Drafting the proposal is the next step to build.')}>Continue to draft</Button>}
          </footer>
        </>
      )}
    </div>
  );
}

function SourcesActions({ p, uploading, onAnalyse, onContinue }: { p: Proposal; uploading: boolean; onAnalyse: () => void; onContinue: () => void }) {
  const hasInput = p.sources.some((s) => s.group !== 'logo') || p.notes.trim().length > 0;
  const disabled = !hasInput || uploading;
  const title = uploading ? 'Wait for the files to finish uploading' : !hasInput ? 'Add the RFP or brief, or paste notes' : undefined;
  if (!p.analysis) {
    return (
      <Button disabled={disabled} title={title} onClick={onAnalyse}>
        Analyse sources
      </Button>
    );
  }
  return (
    <>
      <Button variant="secondary" disabled={disabled} title={title} onClick={onAnalyse}>
        Analyse again
      </Button>
      <Button onClick={onContinue}>Continue to brief</Button>
    </>
  );
}
