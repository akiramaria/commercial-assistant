import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../lib/store';
import { go } from '../lib/router';
import type { CaseStudy, DocType, PoolItem } from '../lib/types';
import { missingTags } from '../lib/types';
import { PERMISSIONS, uniqSorted } from '../lib/options';
import { formatFee, isOutOfDate, monthYear } from '../lib/format';
import { downloadFile } from '../lib/files';
import { Button, FilterChip, Popover } from '../components/ui';
import { Icon, icons } from '../components/icons';
import { ItemDrawer } from './ItemDrawer';

const PAGE_SIZE = 10;

type ItemKey = keyof PoolItem;

interface Column<T> {
  header: string;
  width: number;
  render: (row: T) => ReactNode;
}

interface ItemTab {
  key: string;
  label: string;
  noun: string;
  types: DocType[];
  search: string;
  filters: { key: ItemKey; label: string }[];
  columns: Column<PoolItem>[];
}

const muted = (s: string, fallback = 'Not tagged') => (s ? s : <span className="cell-empty">{fallback}</span>);

const ITEM_TABS: ItemTab[] = [
  {
    key: 'proposals',
    label: 'Proposals',
    noun: 'proposals',
    types: ['Proposal'],
    search: 'Search proposals, clients or methods',
    filters: [
      { key: 'projectType', label: 'Project type' },
      { key: 'sector', label: 'Sector' },
      { key: 'serviceLine', label: 'Service line' },
      { key: 'outcome', label: 'Outcome' },
      { key: 'year', label: 'Year' },
    ],
    columns: [
      { header: 'Project type', width: 150, render: (i) => muted(i.projectType) },
      { header: 'Sector', width: 110, render: (i) => muted(i.sector) },
      { header: 'Service line', width: 180, render: (i) => muted(i.serviceLine) },
      { header: 'Outcome', width: 130, render: (i) => muted(i.outcome, '—') },
      { header: 'Fee', width: 84, render: (i) => muted(formatFee(i.fee), '—') },
      { header: 'Year', width: 48, render: (i) => muted(i.year, '—') },
    ],
  },
  {
    key: 'past-projects',
    label: 'Past projects',
    noun: 'past projects',
    types: ['Past project'],
    search: 'Search projects, clients or lessons',
    filters: [
      { key: 'projectType', label: 'Project type' },
      { key: 'sector', label: 'Sector' },
      { key: 'serviceLine', label: 'Service line' },
      { key: 'engagementModel', label: 'Model' },
      { key: 'year', label: 'Closed' },
    ],
    columns: [
      { header: 'Project type', width: 150, render: (i) => muted(i.projectType) },
      { header: 'Sector', width: 110, render: (i) => muted(i.sector) },
      { header: 'Service line', width: 180, render: (i) => muted(i.serviceLine) },
      { header: 'Model', width: 130, render: (i) => muted(i.engagementModel, '—') },
      { header: 'Fee', width: 84, render: (i) => muted(formatFee(i.fee), '—') },
      { header: 'Closed', width: 48, render: (i) => muted(i.year, '—') },
    ],
  },
  {
    key: 'rfps',
    label: 'RFPs',
    noun: 'RFPs',
    types: ['RFP'],
    search: 'Search RFPs, issuers or requirements',
    filters: [
      { key: 'sector', label: 'Sector' },
      { key: 'projectType', label: 'Project type' },
      { key: 'outcome', label: 'Our response' },
      { key: 'year', label: 'Received' },
    ],
    columns: [
      { header: 'Project type', width: 150, render: (i) => muted(i.projectType) },
      { header: 'Sector', width: 110, render: (i) => muted(i.sector) },
      { header: 'Service line', width: 180, render: (i) => muted(i.serviceLine) },
      { header: 'Budget', width: 100, render: (i) => muted(formatFee(i.fee), '—') },
      { header: 'Our response', width: 110, render: (i) => muted(i.outcome, '—') },
      { header: 'Received', width: 60, render: (i) => muted(i.year, '—') },
    ],
  },
  {
    key: 'notes',
    label: 'Notes & context',
    noun: 'notes',
    types: ['BD notes', 'Context note'],
    search: 'Search notes or clients',
    filters: [
      { key: 'docType', label: 'Type' },
      { key: 'sector', label: 'Sector' },
      { key: 'serviceLine', label: 'Service line' },
      { key: 'year', label: 'Year' },
    ],
    columns: [
      { header: 'Type', width: 110, render: (i) => i.docType },
      { header: 'Project type', width: 150, render: (i) => muted(i.projectType) },
      { header: 'Sector', width: 110, render: (i) => muted(i.sector) },
      { header: 'Service line', width: 180, render: (i) => muted(i.serviceLine) },
      { header: 'Added by', width: 110, render: (i) => i.addedBy },
      { header: 'Year', width: 48, render: (i) => muted(i.year, '—') },
    ],
  },
];

const CASE_FILTERS: { key: keyof CaseStudy; label: string }[] = [
  { key: 'projectType', label: 'Project type' },
  { key: 'sector', label: 'Sector' },
  { key: 'serviceLine', label: 'Service line' },
  { key: 'permission', label: 'Client permission' },
  { key: 'year', label: 'Year' },
];

const TAB_ORDER = ['proposals', 'case-studies', 'past-projects', 'rfps', 'notes'];

function matchesSearch(q: string, fields: (string | string[])[]) {
  if (!q) return true;
  const hay = fields.flat().join(' ').toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w));
}

export function KnowledgePool({ tab }: { tab: string }) {
  const { items, caseStudies, clearSamples, notify } = useStore();
  const activeTab = TAB_ORDER.includes(tab) ? tab : 'proposals';
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [flagOnly, setFlagOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);

  // Reset filters when switching tabs.
  useEffect(() => {
    setQuery('');
    setFilters({});
    setFlagOnly(false);
    setPage(0);
  }, [activeTab]);
  useEffect(() => setPage(0), [query, filters, flagOnly]);

  const counts: Record<string, number> = {
    'case-studies': caseStudies.length,
    ...Object.fromEntries(ITEM_TABS.map((t) => [t.key, items.filter((i) => t.types.includes(i.docType as DocType)).length])),
  };
  const labels: Record<string, string> = {
    'case-studies': 'Case studies',
    ...Object.fromEntries(ITEM_TABS.map((t) => [t.key, t.label])),
  };
  const hasSamples = items.some((i) => i.sample) || caseStudies.some((c) => c.sample);
  const isCases = activeTab === 'case-studies';

  return (
    <div className="pool">
      <header className="pool-header">
        <div className="pool-title">
          <h1>Knowledge pool</h1>
          <p>Past work the assistant draws on for comparables, assumptions, pricing and case studies.</p>
        </div>
        <Button variant="secondary" onClick={() => notify('SharePoint isn’t connected yet.')}>
          Import from SharePoint
        </Button>
        <Button onClick={() => go('/add')}>+&nbsp;&nbsp;Add to knowledge pool</Button>
      </header>

      <nav className="tabs" role="tablist">
        {TAB_ORDER.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={k === activeTab}
            className={`tab${k === activeTab ? ' is-active' : ''}`}
            onClick={() => go(`/pool/${k}`)}
          >
            <span className="tab-label">{labels[k]}</span>
            <span className="tab-count">{counts[k]}</span>
          </button>
        ))}
      </nav>

      {isCases ? (
        <CaseStudiesView
          caseStudies={caseStudies}
          query={query}
          setQuery={setQuery}
          filters={filters}
          setFilters={setFilters}
          flagOnly={flagOnly}
          setFlagOnly={setFlagOnly}
          page={page}
          setPage={setPage}
          hasSamples={hasSamples}
          clearSamples={clearSamples}
        />
      ) : (
        <ItemsView
          tab={ITEM_TABS.find((t) => t.key === activeTab)!}
          items={items}
          query={query}
          setQuery={setQuery}
          filters={filters}
          setFilters={setFilters}
          flagOnly={flagOnly}
          setFlagOnly={setFlagOnly}
          page={page}
          setPage={setPage}
          onEdit={setEditing}
          hasSamples={hasSamples}
          clearSamples={clearSamples}
        />
      )}

      {editing && <ItemDrawer id={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

interface ViewProps {
  query: string;
  setQuery: (q: string) => void;
  filters: Record<string, string[]>;
  setFilters: (f: Record<string, string[]>) => void;
  flagOnly: boolean;
  setFlagOnly: (v: boolean) => void;
  page: number;
  setPage: (p: number) => void;
  hasSamples: boolean;
  clearSamples: () => void;
}

function ItemsView({
  tab,
  items,
  onEdit,
  query,
  setQuery,
  filters,
  setFilters,
  flagOnly,
  setFlagOnly,
  page,
  setPage,
  hasSamples,
  clearSamples,
}: ViewProps & { tab: ItemTab; items: PoolItem[]; onEdit: (id: string) => void }) {
  const { removeItem, notify } = useStore();
  const inTab = useMemo(() => items.filter((i) => tab.types.includes(i.docType as DocType)), [items, tab]);
  const needTags = inTab.filter((i) => missingTags(i).length > 0).length;

  const rows = inTab.filter(
    (i) =>
      matchesSearch(query, [i.title, i.name, i.client, i.projectType, i.sector, i.serviceLine, i.tags, i.body ?? '']) &&
      tab.filters.every((f) => !filters[f.key]?.length || filters[f.key].includes(String(i[f.key]))) &&
      (!filters.tags?.length || filters.tags.every((t) => i.tags.includes(t))) &&
      (!flagOnly || missingTags(i).length > 0),
  );
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const download = (i: PoolItem) => {
    if (i.hasFile) {
      downloadFile(i.id, i.name);
    } else {
      notify(i.sample ? 'Sample rows have no file attached.' : 'No file is stored for this item.');
    }
  };

  return (
    <>
      <FilterBar
        search={tab.search}
        query={query}
        setQuery={setQuery}
        flag={needTags > 0 ? `${needTags} need${needTags === 1 ? 's' : ''} tags` : null}
        flagOnly={flagOnly}
        setFlagOnly={setFlagOnly}
      >
        {tab.filters.map((f) => (
          <FilterChip
            key={f.key}
            label={f.label}
            options={uniqSorted(inTab.map((i) => String(i[f.key] ?? '')))}
            selected={filters[f.key] ?? []}
            onChange={(v) => setFilters({ ...filters, [f.key]: v })}
          />
        ))}
        <FilterChip
          label="Keywords"
          options={uniqSorted(inTab.flatMap((i) => i.tags))}
          selected={filters.tags ?? []}
          onChange={(v) => setFilters({ ...filters, tags: v })}
        />
      </FilterBar>

      <div className="table-wrap">
        <div className="table">
          <div className="tr th">
            <div className="td td-main">{tab.label === 'RFPs' ? 'RFP and issuer' : `${tab.label.replace(/s$/, '').replace(/ & context$/, '')} and client`}</div>
            {tab.columns.map((c) => (
              <div key={c.header} className="td" style={{ width: c.width }}>
                {c.header}
              </div>
            ))}
            <div className="td td-menu" />
          </div>
          {pageRows.map((i) => {
            const missing = missingTags(i).length > 0;
            const status = missing ? 'Needs tags' : i.sensitive ? 'Masked' : '';
            return (
              <div key={i.id} className="tr" onClick={() => onEdit(i.id)}>
                <div className="td td-main">
                  <Icon src={i.kind === 'context' ? icons.message : icons.file16} size={16} />
                  <div className="cell-title">
                    <div className="cell-name">{i.title}</div>
                    <div className="cell-sub">
                      {i.client || 'No client'}
                      {status && <span className="cell-status">·&nbsp;&nbsp;{status}</span>}
                    </div>
                  </div>
                </div>
                {tab.columns.map((c) => (
                  <div key={c.header} className="td" style={{ width: c.width }}>
                    {c.render(i)}
                  </div>
                ))}
                <div className="td td-menu" onClick={(e) => e.stopPropagation()}>
                  <RowMenu
                    actions={[
                      { label: 'Edit tags', run: () => onEdit(i.id) },
                      ...(i.kind === 'file' ? [{ label: 'Download file', run: () => download(i) }] : []),
                      { label: 'Curate case study from this', run: () => go(`/case-studies/new?source=${i.id}`) },
                      {
                        label: 'Remove from pool',
                        danger: true,
                        run: () => {
                          if (confirm(`Remove “${i.title}” from the knowledge pool?`)) {
                            removeItem(i.id);
                            notify('Removed from the knowledge pool.');
                          }
                        },
                      },
                    ]}
                  />
                </div>
              </div>
            );
          })}
          {pageRows.length === 0 && (
            <EmptyRow
              text={inTab.length ? 'Nothing matches these filters.' : `No ${tab.noun} yet.`}
              action={inTab.length ? undefined : { label: 'Add to knowledge pool', run: () => go('/add') }}
            />
          )}
        </div>
      </div>

      <TableFooter
        shown={pageRows.length}
        total={rows.length}
        all={inTab.length}
        noun={tab.noun}
        page={page}
        setPage={setPage}
        hasSamples={hasSamples}
        clearSamples={clearSamples}
      />
    </>
  );
}

function CaseStudiesView({
  caseStudies,
  query,
  setQuery,
  filters,
  setFilters,
  flagOnly,
  setFlagOnly,
  page,
  setPage,
  hasSamples,
  clearSamples,
}: ViewProps & { caseStudies: CaseStudy[] }) {
  const { removeCaseStudy, notify } = useStore();
  const outOfDate = caseStudies.filter((c) => isOutOfDate(c.updatedAt)).length;
  const rows = caseStudies.filter(
    (c) =>
      matchesSearch(query, [c.title, c.client, c.projectType, c.sector, c.serviceLine, c.tags, c.challenge, c.approach, c.impact]) &&
      CASE_FILTERS.every((f) => !filters[f.key]?.length || filters[f.key].includes(String(c[f.key]))) &&
      (!filters.tags?.length || filters.tags.every((t) => c.tags.includes(t))) &&
      (!flagOnly || isOutOfDate(c.updatedAt)),
  );
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <>
      <FilterBar
        search="Search case studies or clients"
        query={query}
        setQuery={setQuery}
        flag={outOfDate > 0 ? `${outOfDate} out of date` : null}
        flagOnly={flagOnly}
        setFlagOnly={setFlagOnly}
      >
        {CASE_FILTERS.map((f) => (
          <FilterChip
            key={f.key}
            label={f.label}
            options={f.key === 'permission' ? PERMISSIONS : uniqSorted(caseStudies.map((c) => String(c[f.key] ?? '')))}
            selected={filters[f.key] ?? []}
            onChange={(v) => setFilters({ ...filters, [f.key]: v })}
          />
        ))}
        <FilterChip
          label="Keywords"
          options={uniqSorted(caseStudies.flatMap((c) => c.tags))}
          selected={filters.tags ?? []}
          onChange={(v) => setFilters({ ...filters, tags: v })}
        />
      </FilterBar>

      <div className="table-wrap">
        <div className="table">
          <div className="tr th">
            <div className="td td-main">Case study and client</div>
            <div className="td" style={{ width: 150 }}>Project type</div>
            <div className="td" style={{ width: 110 }}>Sector</div>
            <div className="td" style={{ width: 180 }}>Service line</div>
            <div className="td" style={{ width: 140 }}>Client permission</div>
            <div className="td" style={{ width: 60 }}>Sources</div>
            <div className="td" style={{ width: 80 }}>Updated</div>
            <div className="td td-menu" />
          </div>
          {pageRows.map((c) => {
            const stale = isOutOfDate(c.updatedAt);
            return (
              <div key={c.id} className="tr" onClick={() => go(`/case-studies/${c.id}`)}>
                <div className="td td-main">
                  <Icon src={icons.file16} size={16} />
                  <div className="cell-title">
                    <div className="cell-name">{c.title}</div>
                    <div className="cell-sub">
                      {c.client || 'No client'}
                      {stale && <span className="cell-status">·&nbsp;&nbsp;Out of date</span>}
                    </div>
                  </div>
                </div>
                <div className="td" style={{ width: 150 }}>{muted(c.projectType)}</div>
                <div className="td" style={{ width: 110 }}>{muted(c.sector)}</div>
                <div className="td" style={{ width: 180 }}>{muted(c.serviceLine)}</div>
                <div className="td" style={{ width: 140 }}>{muted(c.permission, 'Not set')}</div>
                <div className="td" style={{ width: 60 }}>{c.sourceIds.length}</div>
                <div className="td" style={{ width: 80 }}>{monthYear(c.updatedAt)}</div>
                <div className="td td-menu" onClick={(e) => e.stopPropagation()}>
                  <RowMenu
                    actions={[
                      { label: 'Open', run: () => go(`/case-studies/${c.id}`) },
                      {
                        label: 'Delete case study',
                        danger: true,
                        run: () => {
                          if (confirm(`Delete “${c.title}”? Its source documents stay in the pool.`)) {
                            removeCaseStudy(c.id);
                            notify('Case study deleted.');
                          }
                        },
                      },
                    ]}
                  />
                </div>
              </div>
            );
          })}
          {pageRows.length === 0 && (
            <EmptyRow
              text={caseStudies.length ? 'Nothing matches these filters.' : 'No case studies yet. Add one with document type “Case study”.'}
              action={caseStudies.length ? undefined : { label: 'Add to knowledge pool', run: () => go('/add') }}
            />
          )}
        </div>
      </div>

      <TableFooter
        shown={pageRows.length}
        total={rows.length}
        all={caseStudies.length}
        noun="case studies"
        page={page}
        setPage={setPage}
        hasSamples={hasSamples}
        clearSamples={clearSamples}
      />
    </>
  );
}

function FilterBar({
  search,
  query,
  setQuery,
  flag,
  flagOnly,
  setFlagOnly,
  children,
}: {
  search: string;
  query: string;
  setQuery: (q: string) => void;
  flag: string | null;
  flagOnly: boolean;
  setFlagOnly: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="filter-bar">
      <label className="search">
        <Icon src={icons.search} size={16} />
        <input value={query} placeholder={search} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {children}
      <div className="flex-1" />
      {flag && (
        <button type="button" className={`flag${flagOnly ? ' is-on' : ''}`} onClick={() => setFlagOnly(!flagOnly)} aria-pressed={flagOnly}>
          <Icon src={icons.alert} size={14} />
          {flag}
        </button>
      )}
    </div>
  );
}

function RowMenu({ actions }: { actions: { label: string; run: () => void; danger?: boolean }[] }) {
  return (
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
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className={`menu-item${a.danger ? ' menu-danger' : ''}`}
              onClick={() => {
                close();
                a.run();
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

function EmptyRow({ text, action }: { text: string; action?: { label: string; run: () => void } }) {
  return (
    <div className="table-empty">
      <p>{text}</p>
      {action && (
        <Button variant="secondary" onClick={action.run}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

function TableFooter({
  shown,
  total,
  all,
  noun,
  page,
  setPage,
  hasSamples,
  clearSamples,
}: {
  shown: number;
  total: number;
  all: number;
  noun: string;
  page: number;
  setPage: (p: number) => void;
  hasSamples: boolean;
  clearSamples: () => void;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="table-footer">
      <span>
        Showing {shown} of {total === all ? all : `${total} matching`} {noun}.
        {hasSamples && (
          <>
            {' '}Includes sample data.{' '}
            <button
              type="button"
              className="link"
              onClick={() => confirm('Remove all sample rows? Your own uploads stay.') && clearSamples()}
            >
              Remove sample data
            </button>
          </>
        )}
      </span>
      <div className="flex-1" />
      {pages > 1 && (
        <button type="button" className="link" disabled={page === 0} onClick={() => setPage(page - 1)}>
          Previous
        </button>
      )}
      <span>
        Page {page + 1} of {pages}
      </span>
      {pages > 1 && (
        <button type="button" className="link" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
          Next
        </button>
      )}
    </div>
  );
}
