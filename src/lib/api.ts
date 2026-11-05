import type { CaseStudy, MatchRequest, MatchResult, PoolItem, Proposal } from './types';

async function request<T>(method: string, path: string, body?: unknown, raw?: Blob): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: raw ? { 'Content-Type': raw.type || 'application/octet-stream' } : body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  // The session ran out or was signed out elsewhere: send the person back to the login page.
  if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('auth:expired'));
  if (!res.ok) {
    const msg = await res.json().then((j: { error?: string }) => j.error).catch(() => undefined);
    throw new Error(msg ?? `Server error (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

// Whether files go to Vercel Blob (hosted) or through the server to a local folder.
let storage: Promise<'blob' | 'local'> | undefined;
const storageKind = () => (storage ??= request<{ storage: 'blob' | 'local' }>('GET', '/config').then((c) => c.storage));

// Vercel functions accept only ~4.5 MB per request, so hosted uploads go straight from the browser to Blob.
async function toBlob(pathname: string, file: File) {
  const { upload } = await import('@vercel/blob/client');
  await upload(pathname, file, {
    access: 'private',
    handleUploadUrl: '/api/blob/upload',
    contentType: file.type || undefined,
    multipart: file.size > 8 * 1024 * 1024,
  });
}

// Blob pathnames: keep the file name readable (it becomes the download name) but drop anything odd.
const blobName = (name: string) => name.replace(/[^\w.\- ()]+/g, '_').slice(-120) || 'file';

export const api = {
  listItems: () => request<PoolItem[]>('GET', '/items'),
  createItems: (items: PoolItem[]) => request<PoolItem[]>('POST', '/items', items),
  updateItem: (id: string, patch: Partial<PoolItem>) => request<PoolItem>('PATCH', `/items/${id}`, patch),
  deleteItem: (id: string) => request<void>('DELETE', `/items/${id}`),
  uploadFile: async (id: string, file: File) =>
    (await storageKind()) === 'blob' ? toBlob(`files/${id}/${blobName(file.name)}`, file) : request<void>('PUT', `/items/${id}/file`, undefined, file),
  /** Prepares a brief file for matching: uploaded to Blob when hosted, otherwise sent inline. */
  briefFile: async (file: File, toBase64: (f: File) => Promise<string>): Promise<NonNullable<MatchRequest['file']>> => {
    if ((await storageKind()) !== 'blob') return { name: file.name, mime: file.type, data: await toBase64(file) };
    const folder = `briefs/${crypto.randomUUID()}/`;
    await toBlob(`${folder}${blobName(file.name)}`, file);
    return { name: file.name, mime: file.type, blobPath: folder };
  },
  listCaseStudies: () => request<CaseStudy[]>('GET', '/case-studies'),
  saveCaseStudy: (cs: CaseStudy) => request<CaseStudy>('PUT', `/case-studies/${cs.id}`, cs),
  deleteCaseStudy: (id: string) => request<void>('DELETE', `/case-studies/${id}`),
  clearSamples: () => request<void>('POST', '/samples/clear'),
  match: (req: MatchRequest) => request<MatchResult>('POST', '/match', req),
  me: () => request<{ email: string }>('GET', '/auth/me'),
  login: (email: string, password: string) => request<{ email: string }>('POST', '/auth/login', { email, password }),
  logout: () => request<void>('POST', '/auth/logout'),
  listProposals: () => request<Proposal[]>('GET', '/proposals'),
  getProposal: (id: string) => request<Proposal>('GET', `/proposals/${id}`),
  saveProposal: (p: Proposal) => request<Proposal>('PUT', `/proposals/${p.id}`, p),
  deleteProposal: (id: string) => request<void>('DELETE', `/proposals/${id}`),
  /** Uploads one of a proposal's files. The file must already be listed on the saved proposal. */
  uploadSource: async (proposalId: string, fileId: string, file: File) =>
    (await storageKind()) === 'blob'
      ? toBlob(`sources/${fileId}/${blobName(file.name)}`, file)
      : request<void>('PUT', `/proposals/${proposalId}/sources/${fileId}`, undefined, file),
  analyseProposal: (id: string) => request<Proposal>('POST', `/proposals/${id}/analyse`),
  findGaps: (id: string) => request<Proposal>('POST', `/proposals/${id}/gaps`),
};
