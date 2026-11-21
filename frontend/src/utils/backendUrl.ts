/**
 * Resolves HTTP API and WebSocket URLs between Frontend (Next.js) and Backend (NestJS).
 */
function getConfiguredBackendOrigin(): string {
  if (typeof window !== 'undefined') {
    // Quando acessando por ngrok, túnel externo ou proxy reverso (porta 8080):
    // usa a mesma origem para HTTP e WSS relativo (evita bloqueios de CORS e SSL)
    if (
      (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ||
      window.location.port === '8080'
    ) {
      return '';
    }
  }
  const nextUrl = typeof process !== 'undefined' ? process.env?.NEXT_PUBLIC_BACKEND_URL : undefined;
  const raw = (nextUrl || (typeof window !== 'undefined' && (window as any).__BACKEND_URL__) || 'http://localhost:3001').trim();
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
  const proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = typeof window !== 'undefined' ? window.location.host : 'localhost:3001';
  return `${proto}//${host}${cleanPath}`;
}
