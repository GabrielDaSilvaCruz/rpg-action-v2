/**
 * Resolves HTTP API and WebSocket URLs.
 * - Default (monolith: AI Studio, Cloud Run, Render, Railway, local): uses same-origin `/api/*` and `/ws`.
 * - Split deploy (frontend on Vercel + backend `server.ts` on Render/Railway/Cloud Run):
 *   set `VITE_BACKEND_URL=https://seu-backend.com` in Vercel Environment Variables.
 */

function getConfiguredBackendOrigin(): string {
  const raw = (import.meta.env.VITE_BACKEND_URL as string | undefined)?.trim() || '';
  return raw.replace(/\/+$/, '');
}

export function apiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const origin = getConfiguredBackendOrigin();
  return origin ? `${origin}${cleanPath}` : cleanPath;
}

export function wsUrl(pathWithQuery: string): string {
  const cleanPath = pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`;
  const origin = getConfiguredBackendOrigin();
  if (origin) {
    const wsOrigin = origin.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
    return `${wsOrigin}${cleanPath}`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${cleanPath}`;
}
