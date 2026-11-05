import { Fragment, useState } from 'react';
import { Icon, icons } from '../../components/icons';
import { Button } from '../../components/ui';
import { uid } from '../../lib/format';
import { ASSUMPTION_SOURCES } from '../../lib/proposals';
import { useStore } from '../../lib/store';
import type { Assumption, AssumptionSource, GapQuestion, Proposal } from '../../lib/types';

interface Props {
  p: Proposal;
  update: (change: Partial<Proposal> | ((cur: Proposal) => Partial<Proposal>)) => void;
  onCheckAgain: () => void;
}

const SHOW_FIRST = 6;

/**
 * An answered question also becomes a "Your answer" assumption, linked by questionId, so the estimate
 * uses it. Keeping the placeholder removes that assumption again.
 */
function withAnswer(cur: Proposal, q: GapQuestion): Partial<Proposal> {
  const questions = cur.questions.map((x) => (x.id === q.id ? q : x));
  const others = cur.assumptions.filter((a) => a.questionId !== q.id);
  const linked = cur.assumptions.find((a) => a.questionId === q.id);
  const text = q.answer.trim();
  if (q.mode !== 'answer' || !text) return { questions, assumptions: others };
  const a: Assumption = { id: linked?.id ?? uid(), text, source: 'Your answer', questionId: q.id };
  return { questions, assumptions: linked ? cur.assumptions.map((x) => (x.id === a.id ? a : x)) : [...others, a] };
}

export function GapsStep({ p, update, onCheckAgain }: Props) {
  const { notify } = useStore();

  const setQuestion = (q: GapQuestion) => update((cur) => withAnswer(cur, q));

  const copyQuestions = async () => {
    const heading = [p.client, p.title].filter(Boolean).join(' – ');
    const text = [`Questions${heading ? ` for ${heading}` : ''}`, '', ...p.questions.map((q, i) => `${i + 1}. ${q.question}`)].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      notify(`Copied ${p.questions.length} questions. Paste them into Word or Google Docs.`);
    } catch {
      notify('Couldn’t copy. Your browser blocked the clipboard.');
    }
  };

  return (
    <div className="flow-body">
      <div className="flow-cols">
        <section className="card flow-col-main gaps-card">
          <div className="card-head">
            <h3 className="card-title">Gaps and questions</h3>
            <div className="flex-1" />
            <Button variant="ghost" onClick={onCheckAgain}>
              Check again
            </Button>
          </div>
          <p className="card-desc">The assistant carries on with placeholder values so you are not blocked. Answer what you know, or send the rest to the client.</p>
          {p.questions.length === 0 && <p className="hint">No gaps found: the sources answer everything needed to scope this work.</p>}
          {p.questions.map((q, i) => (
            <Fragment key={q.id}>
              {i > 0 && <div className="divider" />}
              <Question n={i + 1} q={q} onChange={setQuestion} />
            </Fragment>
          ))}
          {p.questions.length > 0 && (
            <Button variant="secondary" className="self-start" onClick={copyQuestions}>
              Copy questions for client
            </Button>
          )}
        </section>

        <Assumptions p={p} update={update} />
      </div>
    </div>
  );
}

function Question({ n, q, onChange }: { n: number; q: GapQuestion; onChange: (q: GapQuestion) => void }) {
  return (
    <div className="gap">
      <div className="gap-head">
        <p className="gap-question">
          {n}.&nbsp;&nbsp;{q.question}
        </p>
        <p className="gap-why">{q.why}</p>
      </div>
      <div className="gap-toggle-row">
        <div className="toggle" role="radiogroup" aria-label={`Question ${n}`}>
          {(
            [
              ['answer', 'Answer now'],
              ['placeholder', 'Keep placeholder'],
            ] as const
          ).map(([mode, label]) => (
            <button key={mode} type="button" role="radio" aria-checked={q.mode === mode} className={q.mode === mode ? 'is-on' : ''} onClick={() => onChange({ ...q, mode })}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="box box-area">
        <textarea
          rows={3}
          value={q.answer}
          aria-label={`Answer to question ${n}`}
          placeholder={q.mode === 'placeholder' ? 'Type to answer instead of using the placeholder' : 'Your answer'}
          // Typing an answer switches the question to "Answer now".
          onChange={(e) => onChange({ ...q, answer: e.target.value, mode: 'answer' })}
        />
      </div>
      <p className={`gap-placeholder${q.mode === 'placeholder' ? ' is-used' : ''}`}>Placeholder: {q.placeholder}</p>
    </div>
  );
}

function Assumptions({ p, update }: { p: Proposal; update: Props['update'] }) {
  const [filter, setFilter] = useState<AssumptionSource | 'All'>('All');
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const count = (s: AssumptionSource) => p.assumptions.filter((a) => a.source === s).length;
  const shown = p.assumptions.filter((a) => filter === 'All' || a.source === filter);
  const visible = expanded ? shown : shown.slice(0, SHOW_FIRST);
  const questionNo = (id?: string) => (id ? p.questions.findIndex((q) => q.id === id) + 1 : 0);

  const add = () => {
    const a: Assumption = { id: uid(), text: '', source: 'Your answer' };
    update((cur) => ({ assumptions: [a, ...cur.assumptions] }));
    setFilter('All');
    setEditing(a.id);
  };

  const edit = (a: Assumption, text: string) =>
    update((cur) => {
      const assumptions = cur.assumptions.map((x) => (x.id === a.id ? { ...x, text } : x));
      // Editing an answer's assumption edits the answer too, so the two stay the same.
      const questions = a.questionId ? cur.questions.map((q) => (q.id === a.questionId ? { ...q, answer: text, mode: 'answer' as const } : q)) : cur.questions;
      return { assumptions, questions };
    });

  const remove = (a: Assumption) =>
    update((cur) => ({
      assumptions: cur.assumptions.filter((x) => x.id !== a.id),
      // Removing an answer's assumption clears the answer, so the placeholder is used again.
      questions: a.questionId ? cur.questions.map((q) => (q.id === a.questionId ? { ...q, answer: '', mode: 'placeholder' as const } : q)) : cur.questions,
    }));

  // Empty assumptions left behind after editing are dropped.
  const finish = (a: Assumption) => {
    setEditing(null);
    if (!a.text.trim()) remove(a);
  };

  return (
    <section className="card flow-col-wide">
      <div className="card-head">
        <h3 className="card-title">Assumptions</h3>
        <span className="pill">{p.assumptions.length}</span>
        <div className="flex-1" />
        <Button variant="ghost" onClick={add}>
          +&nbsp;&nbsp;Add
        </Button>
      </div>
      <p className="card-desc">Pulled from the template and similar past proposals. AI suggestions cover anything new. Check each before it goes into the estimate.</p>
      <div className="pill-row">
        <button type="button" className={`pill ${filter === 'All' ? 'pill-dark' : 'pill-outline'}`} onClick={() => setFilter('All')}>
          All {p.assumptions.length}
        </button>
        {ASSUMPTION_SOURCES.map((s) => (
          <button key={s} type="button" className={`pill ${filter === s ? 'pill-dark' : 'pill-outline'}`} onClick={() => setFilter(s)}>
            {s} {count(s)}
          </button>
        ))}
      </div>
      {visible.map((a) => (
        <div key={a.id} className={`assumption${a.source === 'AI suggested' ? ' is-ai' : ''}`}>
          <div className="assumption-body">
            {editing === a.id ? (
              <textarea
                className="assumption-edit"
                autoFocus
                rows={2}
                value={a.text}
                placeholder="Write the assumption"
                onChange={(e) => edit(a, e.target.value)}
                onBlur={() => finish(a)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), finish(a))}
              />
            ) : (
              <p className="assumption-text">{a.text}</p>
            )}
            <div className="assumption-tags">
              <span className={`pill${a.source === 'AI suggested' ? ' pill-dark' : ''}`}>{a.source}</span>
              {a.questionId && questionNo(a.questionId) > 0 && <span className="hint">Answer to question {questionNo(a.questionId)}</span>}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={() => setEditing(a.id)} aria-label="Edit assumption">
            <Icon src={icons.editMuted} size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={() => remove(a)} aria-label="Remove assumption">
            <Icon src={icons.x} size={16} />
          </button>
        </div>
      ))}
      {shown.length === 0 && <p className="hint">None yet.</p>}
      {shown.length > SHOW_FIRST && (
        <Button variant="ghost" className="self-start" onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'Show fewer' : `Show ${shown.length - SHOW_FIRST} more`}
        </Button>
      )}
    </section>
  );
}
