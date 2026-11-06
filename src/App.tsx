import { useEffect } from 'react';
import { useRoute } from './lib/router';
import { useStore } from './lib/store';
import { Sidebar } from './components/Sidebar';
import { Button, Toasts } from './components/ui';
import { KnowledgePool } from './pages/KnowledgePool';
import { AddToPool } from './pages/AddToPool';
import { CaseStudyEditor } from './pages/CaseStudyEditor';
import { MatchBrief } from './pages/MatchBrief';
import { Proposals } from './pages/Proposals';
import { ProposalFlow } from './pages/proposal/ProposalFlow';

export default function App() {
  const { parts, query } = useRoute();
  // Proposals is the landing page: send the bare address and any unknown one (e.g. an old #/home link) there.
  const known = ['proposals', 'pool', 'add', 'case-studies', 'match'].includes(parts[0]);
  useEffect(() => {
    if (!known || !window.location.hash) window.location.replace('#/proposals');
  }, [known]);
  const { toasts, status, error, reload } = useStore();
  // No message means no response at all; otherwise the server explained what's wrong.
  const serverDown = !error || error.startsWith('Server error');

  let page;
  // Pages read the loaded data when they mount (e.g. a case study's sources), so wait for it.
  if (status === 'loading') {
    page = <div className="state-msg">Loading the knowledge pool…</div>;
  } else if (status === 'error') {
    page = (
      <div className="state-msg">
        <p className="placeholder-title">{serverDown ? 'Can’t reach the server' : 'The server can’t load the knowledge pool'}</p>
        <p className="hint">{serverDown ? 'Start it with npm run dev, then try again.' : error}</p>
        <Button variant="secondary" onClick={reload}>
          Try again
        </Button>
      </div>
    );
  } else if (parts[0] === 'match') {
    page = <MatchBrief />;
  } else if (parts[0] === 'add') {
    page = <AddToPool />;
  } else if (parts[0] === 'case-studies' && parts[1]) {
    const id = parts[1] === 'new' ? undefined : parts[1];
    // Keyed so switching between case studies resets the form.
    page = <CaseStudyEditor key={`${parts[1]}:${query.get('source') ?? ''}`} id={id} sourceId={query.get('source')} />;
  } else if (parts[0] === 'proposals' && parts[1]) {
    // Keyed so opening another proposal starts fresh.
    page = <ProposalFlow key={parts[1]} id={parts[1]} view={parts[2]} />;
  } else if (parts[0] === 'pool') {
    page = <KnowledgePool tab={parts[1] ?? 'proposals'} />;
  } else {
    page = <Proposals />;
  }

  return (
    <div className="app">
      <Sidebar />
      <main className="main">{page}</main>
      <Toasts toasts={toasts} />
    </div>
  );
}
