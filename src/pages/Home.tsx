import { useRef, useState } from 'react';
import { Icon, icons } from '../components/icons';
import { Button } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatBytes } from '../lib/format';
import { useStore } from '../lib/store';
import type { MatchRequest, MatchResult } from '../lib/types';
import { Results, toBase64 } from './MatchBrief';

const ACCEPT = '.pdf,.txt,.md';
const MAX_BYTES = 30 * 1024 * 1024;
// Keeps the last answer while people open a case study and come back.
const SAVED_KEY = 'home:last';

function loadSaved(): MatchResult | null {
  try {
    const raw = sessionStorage.getItem(SAVED_KEY);
    return raw ? (JSON.parse(raw) as MatchResult) : null;
  } catch {
    return null;
  }
}

export function Home() {
  const { email } = useAuth();
  const { caseStudies } = useStore();
  const local = email.split('@')[0];
  const name = local.charAt(0).toUpperCase() + local.slice(1);

  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<MatchResult | null>(loadSaved);
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_BYTES) return setError(`“${f.name}” is over 30 MB.`);
    if (!/\.(pdf|txt|md)$/i.test(f.name)) return setError('Attach a PDF or text file. For Word or PowerPoint, paste the text instead.');
    setError('');
    setFile(f);
  };

  const ready = !busy && (text.trim() || file);

  const run = async () => {
    if (!ready) return;
    setBusy(true);
    setError('');
    try {
      const req: MatchRequest = { text };
      if (file) req.file = await api.briefFile(file, toBase64);
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
    <div className="home">
      <h1 className="home-title">Welcome back, {name}</h1>

      <section className="home-ask">
        <div className="home-ask-inner">
          <h2 className="home-ask-title">What would you like to do?</h2>
          <label htmlFor="home-brief" className="home-ask-sub">
            Find proposals/ case studies, ask questions about past projects, or attach brief documents
          </label>
          <div className="composer">
            <textarea
              id="home-brief"
              className="composer-input"
              value={text}
              placeholder="Find design thinking workshop case studies we have done in the past year."
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  run();
                }
              }}
            />
            <div className="composer-bar">
              <button type="button" className="composer-attach" aria-label="Attach a brief" title="Attach a brief (PDF or text)" onClick={() => inputRef.current?.click()}>
                <Icon src={icons.plus} size={16} />
              </button>
              {file && (
                <span className="composer-file">
                  <Icon src={icons.file16} size={16} />
                  <span className="composer-file-name">{file.name}</span>
                  <span className="hint">{formatBytes(file.size)}</span>
                  <button type="button" className="composer-file-remove" aria-label={`Remove ${file.name}`} onClick={() => setFile(null)}>
                    <Icon src={icons.x} size={12} />
                  </button>
                </span>
              )}
              <div className="flex-1" />
              <button type="button" className="composer-send" aria-label="Find case studies" disabled={!ready} onClick={run}>
                <Icon src={icons.send} size={16} />
              </button>
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
          </div>
          {busy && <p className="hint">Claude is reading the brief and the library. This usually takes under a minute.</p>}
          {error && <p className="error-text">{error}</p>}
        </div>
      </section>

      {result && !busy && (
        <div className="home-results">
          <div className="row-end">
            <div className="flex-1" />
            <Button
              variant="ghost"
              onClick={() => {
                setResult(null);
                try {
                  sessionStorage.removeItem(SAVED_KEY);
                } catch {
                  /* nothing saved */
                }
              }}
            >
              Clear results
            </Button>
          </div>
          <Results result={result} titleFor={titleFor} exists={exists} />
        </div>
      )}
    </div>
  );
}
