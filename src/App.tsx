import { useRoute } from './lib/router';
import { useStore } from './lib/store';
import { Sidebar } from './components/Sidebar';
import { Button, Toasts } from './components/ui';
import { KnowledgePool } from './pages/KnowledgePool';
import { AddToPool } from './pages/AddToPool';
import { CaseStudyEditor } from './pages/CaseStudyEditor';
import { MatchBrief } from './pages/MatchBrief';

export default function App() {
  const { parts, query } = useRoute();
  const { toasts, status, reload } = useStore();

  let page;
  // Pages read the loaded data when they mount (e.g. a case study's sources), so wait for it.
  if (status === 'loading') {
    page = <div className="state-msg">Loading the knowledge pool…</div>;
  } else if (status === 'error') {
    page = (
      <div className="state-msg">
        <p className="placeholder-title">Can’t reach the server</p>
        <p className="hint">Start it with npm run dev, then try again.</p>
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
  } else {
    page = <KnowledgePool tab={parts[1] ?? 'proposals'} />;
  }

  return (
    <div className="app">
      <Sidebar />
      <main className="main">{page}</main>
      <Toasts toasts={toasts} />
    </div>
  );
}
