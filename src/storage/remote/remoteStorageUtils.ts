import path from 'path';

export const sanitizeRemoteFileName = (value: string): string => {
  const base = path.basename(value).replace(/\.mp4$/i, '');
  const safe = base
    .normalize('NFKC')
    .split('')
    .map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
    .join('')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/[. ]+$/g, '')
    .slice(0, 180);

  if (!safe || safe === '.' || safe === '..') {
    throw new Error('Invalid remote video name');
  }

  return safe;
};

export const normalizeBasePath = (value: string): string => {
  const parts = value
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.some((part) => part === '.' || part === '..')) {
    throw new Error('Remote base path must not contain dot segments');
  }

  return parts.length
    ? parts.map(encodeURIComponent).join('/')
    : 'WarcraftRecorder';
};

export const normalizeWebDavEndpoint = (
  serverUrl: string,
  provider: string,
  username: string,
): { endpoint: string; insecure: boolean } => {
  const candidate = serverUrl.trim();
  if (!candidate) throw new Error('Server URL is required');

  const parsed = new URL(
    candidate.includes('://') ? candidate : `https://${candidate}`,
  );
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only HTTP and HTTPS WebDAV URLs are supported');
  }

  parsed.username = '';
  parsed.password = '';
  parsed.hash = '';
  parsed.search = '';

  let pathname = parsed.pathname.replace(/\/+$/, '');
  const isFullEndpoint = /\/remote\.php\/(?:dav\/files\/[^/]+|webdav)$/i.test(
    pathname,
  );

  if (provider === 'nextcloud' && !isFullEndpoint) {
    if (!username.trim())
      throw new Error('Username is required for Nextcloud URLs');
    pathname += `/remote.php/dav/files/${encodeURIComponent(username.trim())}`;
  }

  parsed.pathname = `${pathname}/`;
  return { endpoint: parsed.toString(), insecure: parsed.protocol === 'http:' };
};

export const redactRemoteStorageError = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/https?:\/\/[^\s@/]+:[^\s@/]+@/gi, 'https://')
    .replace(
      /(authorization|password|token)\s*[:=]\s*[^\s,;]+/gi,
      '$1=[REDACTED]',
    )
    .slice(0, 500);
};
