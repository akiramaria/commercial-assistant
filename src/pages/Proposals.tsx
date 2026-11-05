import { useEffect, useMemo, useState } from 'react';
import { Icon, icons } from '../components/icons';
import { Button, Popover } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dueLabel, initials, startProposal } from '../lib/proposals';
import { go } from '../lib/router';
import { useStore } from '../lib/store';

// Built from the Figma "01 Proposals home" frame. Proposals created in the app are listed first;
// the rest of the rows and the figures are the design's sample data, and stage changes last until reload.

type Stage = 'Drafting' | 'Submitted' | 'Won' | 'Lost';
const STAGES: Stage[] = ['Drafting', 'Submitted', 'Won', 'Lost'];

interface Proposal {
  id: string;
  title: string;
  client: string;
  owner: string;
  stage: Stage;
  due: string;
  value: string;
  /** Created in the app, so it opens and can be deleted. */
  saved?: boolean;
}

const SAMPLE: Proposal[] = [
  { id: 'p1', title: 'Citizen services portal discovery', client: 'Civic Services Agency', owner: 'AT', stage: 'Drafting', due: '7 Nov 2026', value: 'S$86,500' },
  { id: 'p2', title: 'Claims journey research', client: 'Meridian Insurance', owner: 'PN', stage: 'Drafting', due: '21 Nov 2026', value: 'Not yet priced' },
  { id: 'p3', title: 'Design system audit', client: 'Harbour Credit Union', owner: 'JL', stage: 'Won', due: '30 Oct 2026', value: 'S$42,000' },
  { id: 'p4', title: 'Service blueprint workshop', client: 'Eastgate Polytechnic', owner: 'AT', stage: 'Won', due: '12 Oct 2026', value: 'S$18,900' },
  { id: 'p5', title: 'Wealth app usability test', client: 'Kestrel Private Bank', owner: 'PN', stage: 'Lost', due: '2 Oct 2026', value: 'S$36,000' },
  { id: 'p6', title: 'Learning platform UX review', client: 'Northpoint College', owner: 'JL', stage: 'Lost', due: '18 Sep 2026', value: 'S$24,000' },
];

const STATS = [
  { label: 'In progress', value: '6', note: '2 due this week' },
  { label: 'Pages in review', value: '4', note: 'Across 2 proposals' },
  { label: 'Submitted this quarter', value: '9', note: '4 awaiting a decision' },
  { label: 'Win rate, last 12 months', value: '38%', note: 'Placeholder figure' },
];

const stageTone: Record<Stage, string> = { Drafting: 'pill', Submitted: 'pill', Won: 'pill pill-dark', Lost: 'pill pill-muted' };

export function Proposals() {
  const { notify } = useStore();
  const { email } = useAuth();
  const [rows, setRows] = useState(SAMPLE);

  useEffect(() => {
    api.listProposals().then(
      (saved) =>
        setRows([
          ...saved.map(
            (p): Proposal => ({
              id: p.id,
              title: p.title || 'Untitled proposal',
              client: p.client || '—',
              owner: p.owner,
              stage: 'Drafting',
              due: dueLabel(p.deadline) || '—',
              value: 'Not yet priced',
              saved: true,
            }),
          ),
          ...SAMPLE,
        ]),
      () => notify('Couldn’t load saved proposals.'),
    );
  }, [notify]);

  const newProposal = () => startProposal(initials(email)).catch(() => notify('Couldn’t start a proposal. Try again.'));
  const remove = async (r: Proposal) => {
    if (!window.confirm(`Delete “${r.title}” and its uploaded files? This can’t be undone.`)) return;
    try {
      await api.deleteProposal(r.id);
      setRows((cur) => cur.filter((x) => x.id !== r.id));
    } catch {
      notify('Couldn’t delete the proposal.');
    }
  };
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<Stage | 'All'>('All');
  const [owner, setOwner] = useState('Anyone');

  const owners = useMemo(() => [...new Set(rows.map((r) => r.owner))].sort(), [rows]);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = rows.filter(
    (r) =>
      (stage === 'All' || r.stage === stage) &&
      (owner === 'Anyone' || r.owner === owner) &&
      words.every((w) => `${r.title} ${r.client}`.toLowerCase().includes(w)),
  );
  const notBuilt = () => notify('This is sample data from the design; it doesn’t open.');

  return (
    <div className="pool">
      <header className="pool-header">
        <div className="pool-title">
          <h1>Proposals</h1>
          <p>Draft, price and track every proposal in one place.</p>
        </div>
        <Button variant="secondary" onClick={() => go('/add')}>
          Add to knowledge pool
        </Button>
        <Button variant="secondary" onClick={() => go('/match')}>
          Find Case Studies
        </Button>
        <Button onClick={newProposal}>+&nbsp;&nbsp;New proposal</Button>
      </header>

      <div className="stat-row">
        {STATS.map((s) => (
          <div key={s.label} className="stat">
            <p className="stat-label">{s.label}</p>
            <p className="stat-value">{s.value}</p>
            <p className="stat-note">{s.note}</p>
          </div>
        ))}
      </div>

      <div className="filter-bar">
        <label className="search search-lg">
          <Icon src={icons.search} size={16} />
          <input value={query} placeholder="Search proposals or clients" onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div style={{ width: 8 }} />
        {(['All', ...STAGES] as const).map((s) => (
          <button key={s} type="button" className={`pill ${stage === s ? 'pill-dark' : 'pill-outline'}`} aria-pressed={stage === s} onClick={() => setStage(s)}>
            {s}
          </button>
        ))}
        <div className="flex-1" />
        <Popover
          align="right"
          trigger={(_, toggle) => (
            <button type="button" className="owner-filter" onClick={toggle}>
              Owner: {owner}
              <Icon src={icons.chevronCard} size={16} />
            </button>
          )}
        >
          {(close) => (
            <div className="menu">
              {['Anyone', ...owners].map((o) => (
                <button
                  key={o}
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    setOwner(o);
                    close();
                  }}
                >
                  {o}
                </button>
              ))}
            </div>
          )}
        </Popover>
      </div>

      <div className="table-wrap proposals-table">
        <div className="table">
          <div className="tr th">
            <div className="td td-main">Proposal</div>
            <div className="td" style={{ width: 220 }}>Client</div>
            <div className="td" style={{ width: 90 }}>Owner</div>
            <div className="td" style={{ width: 200 }}>Stage</div>
            <div className="td" style={{ width: 110 }}>Due</div>
            <div className="td" style={{ width: 120 }}>Est. value</div>
            <div className="td td-menu" />
          </div>
          {shown.map((r) => (
            <div key={r.id} className="tr" onClick={r.saved ? () => go(`/proposals/${r.id}`) : notBuilt}>
              <div className="td td-main">{r.title}</div>
              <div className="td" style={{ width: 220 }}>{r.client}</div>
              <div className="td" style={{ width: 90 }}>
                <div className="avatar">{r.owner}</div>
              </div>
              <div className="td td-stage" style={{ width: 200 }} onClick={(e) => e.stopPropagation()}>
                <Popover
                  trigger={(_, toggle) => (
                    <button type="button" className="stage-btn" onClick={toggle} aria-label={`Stage: ${r.stage}`}>
                      <span className={stageTone[r.stage]}>{r.stage}</span>
                      <Icon src={icons.chevronStage} size={12} />
                    </button>
                  )}
                >
                  {(close) => (
                    <div className="menu">
                      {STAGES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className="menu-item"
                          onClick={() => {
                            setRows((cur) => cur.map((x) => (x.id === r.id ? { ...x, stage: s } : x)));
                            close();
                          }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </Popover>
              </div>
              <div className="td" style={{ width: 110 }}>{r.due}</div>
              <div className="td" style={{ width: 120 }}>{r.value}</div>
              <div className="td td-menu" onClick={(e) => e.stopPropagation()}>
                <Popover
                  align="right"
                  trigger={(_, toggle) => (
                    <button type="button" className="icon-btn" onClick={toggle} aria-label="More actions">
                      <Icon src={icons.more} size={16} />
                    </button>
                  )}
                >
                  {(close) => (
                    <div className="menu">
                      <button
                        type="button"
                        className="menu-item"
                        onClick={() => {
                          close();
                          go('/match');
                        }}
                      >
                        Find case studies
                      </button>
                      {r.saved && (
                        <button
                          type="button"
                          className="menu-item menu-danger"
                          onClick={() => {
                            close();
                            remove(r);
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </Popover>
              </div>
            </div>
          ))}
          {!shown.length && <div className="table-empty">No proposals match these filters.</div>}
        </div>
      </div>
    </div>
  );
}
