export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function formatBytes(n?: number): string {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  const mb = n / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export function monthYear(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export function fileKind(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'PDF';
  if (ext === 'ppt' || ext === 'pptx' || ext === 'key') return 'PowerPoint';
  if (ext === 'doc' || ext === 'docx') return 'Word';
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'Spreadsheet';
  if (ext === 'md' || ext === 'txt') return 'Text';
  return ext ? ext.toUpperCase() : 'File';
}

export function wordCount(s?: string): number {
  return (s ?? '').trim().split(/\s+/).filter(Boolean).length;
}

export function formatFee(raw: string): string {
  const n = Number(String(raw).replace(/[^0-9.]/g, ''));
  if (!raw || Number.isNaN(n) || n === 0) return '';
  return `S$${n.toLocaleString('en-US')}`;
}

/** Older than 18 months counts as out of date for case studies. */
export function isOutOfDate(iso: string): boolean {
  const d = new Date(iso);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 18);
  return d < cutoff;
}
