import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CaseStudy, PoolItem } from './types';
import { api } from './api';
import { ENGAGEMENT_MODELS, OUTCOMES, PROJECT_TYPES, SECTORS, SERVICE_LINES, uniqSorted } from './options';

interface Toast {
  id: number;
  message: string;
}

interface Store {
  items: PoolItem[];
  caseStudies: CaseStudy[];
  status: 'loading' | 'ready' | 'error';
  /** The server's explanation when status is 'error', if it gave one. */
  error: string;
  reload: () => void;
  /** Saves items, then uploads their files. Throws if the server rejects them. */
  addItems: (items: PoolItem[], files: Map<string, File>) => Promise<void>;
  updateItem: (id: string, patch: Partial<PoolItem>) => Promise<boolean>;
  removeItem: (id: string) => Promise<void>;
  saveCaseStudy: (cs: CaseStudy) => Promise<boolean>;
  removeCaseStudy: (id: string) => Promise<void>;
  clearSamples: () => Promise<void>;
  toasts: Toast[];
  notify: (message: string) => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<PoolItem[]>([]);
  const [caseStudies, setCaseStudies] = useState<CaseStudy[]>([]);
  const [status, setStatus] = useState<Store['status']>('loading');
  const [error, setError] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const reload = useCallback(async () => {
    try {
      const [i, c] = await Promise.all([api.listItems(), api.listCaseStudies()]);
      setItems(i);
      setCaseStudies(c);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : '');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    reload();
    // Refetch when the tab comes back into view, so a tab left open picks up
    // changes made elsewhere (another tab, another person, the server).
    const onVisible = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [reload]);

  const value = useMemo<Store>(() => {
    const fail = (e: unknown) => notify(e instanceof Error ? e.message : 'Something went wrong.');
    return {
      items,
      caseStudies,
      status,
      error,
      reload,
      toasts,
      notify,
      addItems: async (next, files) => {
        const saved = await api.createItems(next);
        const failed: string[] = [];
        for (const item of saved) {
          const file = files.get(item.id);
          if (!file) continue;
          try {
            await api.uploadFile(item.id, file);
            item.hasFile = true;
          } catch {
            failed.push(item.name);
          }
        }
        setItems((cur) => [...saved, ...cur]);
        // The server turns "Case study" documents into case-study records.
        if (saved.some((i) => i.docType === 'Case study')) setCaseStudies(await api.listCaseStudies());
        if (failed.length) notify(`Saved, but these files didn’t upload: ${failed.join(', ')}`);
      },
      updateItem: async (id, patch) => {
        try {
          const saved = await api.updateItem(id, patch);
          setItems((cur) => cur.map((i) => (i.id === id ? { ...saved, hasFile: i.hasFile } : i)));
          if (saved.docType === 'Case study') setCaseStudies(await api.listCaseStudies());
          return true;
        } catch (e) {
          fail(e);
          return false;
        }
      },
      removeItem: async (id) => {
        try {
          await api.deleteItem(id);
          setItems((cur) => cur.filter((i) => i.id !== id));
          setCaseStudies((cur) => cur.map((c) => ({ ...c, sourceIds: c.sourceIds.filter((s) => s !== id) })));
        } catch (e) {
          fail(e);
        }
      },
      saveCaseStudy: async (cs) => {
        try {
          const saved = await api.saveCaseStudy(cs);
          setCaseStudies((cur) => [saved, ...cur.filter((c) => c.id !== saved.id)]);
          return true;
        } catch (e) {
          fail(e);
          return false;
        }
      },
      removeCaseStudy: async (id) => {
        try {
          await api.deleteCaseStudy(id);
          setCaseStudies((cur) => cur.filter((c) => c.id !== id));
        } catch (e) {
          fail(e);
        }
      },
      clearSamples: async () => {
        try {
          await api.clearSamples();
          await reload();
        } catch (e) {
          fail(e);
        }
      },
    };
  }, [items, caseStudies, status, error, reload, toasts, notify]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

/** Tag vocabularies: the defaults plus anything people have typed in. */
export function useOptions() {
  const { items, caseStudies } = useStore();
  return useMemo(() => {
    const all = [...items, ...caseStudies];
    const pick = (k: 'client' | 'projectType' | 'sector' | 'serviceLine') => all.map((i) => i[k]);
    return {
      clients: uniqSorted(pick('client')),
      projectTypes: uniqSorted(PROJECT_TYPES, pick('projectType')),
      sectors: uniqSorted(SECTORS, pick('sector')),
      serviceLines: uniqSorted(SERVICE_LINES, pick('serviceLine')),
      outcomes: uniqSorted(OUTCOMES, items.map((i) => i.outcome)),
      engagementModels: uniqSorted(ENGAGEMENT_MODELS, items.map((i) => i.engagementModel)),
      tags: uniqSorted(all.flatMap((i) => i.tags)),
    };
  }, [items, caseStudies]);
}
