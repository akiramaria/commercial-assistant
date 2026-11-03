// File contents live on the server (server/data/files); see server/index.ts.

export function downloadFile(id: string, name: string) {
  const a = document.createElement('a');
  a.href = `/api/items/${encodeURIComponent(id)}/file`;
  a.download = name;
  a.click();
}
