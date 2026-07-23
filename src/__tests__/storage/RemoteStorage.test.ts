import axios, { AxiosError } from 'axios';
import fs from 'fs';
import { Readable } from 'stream';
import { migrateLegacyRemoteStorage } from '../../config/remoteStorageMigration';
import { createRemoteStorageProvider } from '../../storage/remote/RemoteStorageProviderFactory';
import WebDavStorageProvider from '../../storage/remote/WebDavStorageProvider';
import {
  normalizeBasePath,
  normalizeWebDavEndpoint,
  redactRemoteStorageError,
  sanitizeRemoteFileName,
} from '../../storage/remote/remoteStorageUtils';
import { Flavour, Metadata } from '../../main/types';
import { VideoCategory } from '../../types/VideoCategory';

const metadata: Metadata = {
  category: VideoCategory.Manual,
  duration: 10,
  result: true,
  flavour: Flavour.Retail,
  combatants: [],
  overrun: 0,
};

const config = {
  provider: 'webdav' as const,
  serverUrl: 'https://dav.example.test/root/',
  username: 'user',
  password: 'secret',
  basePath: 'LappenRecorder',
  timeoutMs: 50,
};

describe('remote storage helpers and factory', () => {
  test('disabled storage returns the null provider', async () => {
    const provider = createRemoteStorageProvider(
      {
        remoteStorageEnabled: false,
        remoteStorageProvider: 'nextcloud',
        webdavServerUrl: '',
        webdavUsername: '',
        webdavBasePath: '',
      },
      '',
    );
    expect(provider.id).toBe('disabled');
    await expect(provider.ready()).resolves.toBe(false);
    expect(provider.capabilities.upload).toBe(false);
    expect(provider.capabilities.chat).toBe(false);
  });

  test('normalizes Nextcloud base URLs and complete endpoints', () => {
    expect(
      normalizeWebDavEndpoint('cloud.example.test', 'nextcloud', 'Me').endpoint,
    ).toBe('https://cloud.example.test/remote.php/dav/files/Me/');
    expect(
      normalizeWebDavEndpoint(
        'https://cloud.example.test/remote.php/webdav',
        'nextcloud',
        'Me',
      ).endpoint,
    ).toBe('https://cloud.example.test/remote.php/webdav/');
    expect(() =>
      normalizeWebDavEndpoint('file:///private', 'webdav', 'Me'),
    ).toThrow('HTTP and HTTPS');
  });

  test('normalizes paths and rejects traversal', () => {
    expect(normalizeBasePath('/Team Recordings/WoW/')).toBe(
      'Team%20Recordings/WoW',
    );
    expect(() => normalizeBasePath('../private')).toThrow('dot segments');
    expect(sanitizeRemoteFileName('../../raid:name.mp4')).toBe('raid_name');
  });

  test('redacts credentials from errors', () => {
    const safe = redactRemoteStorageError(
      new Error('https://user:secret@example.test password=secret'),
    );
    expect(safe).not.toContain('secret');
    expect(safe).not.toContain('user:');
  });

  test('migrates legacy flags but never credentials and is idempotent', () => {
    const migration = migrateLegacyRemoteStorage({
      cloudStorage: true,
      cloudUpload: true,
      cloudAccountName: 'old@example.test',
      cloudAccountPassword: 'do-not-reuse',
      cloudGuildName: 'guild',
      cloudUploadRateLimit: true,
      cloudUploadRateLimitMbps: 12,
    });
    expect(migration?.values).toMatchObject({
      remoteStorageEnabled: false,
      remoteStorageAutoUpload: true,
      remoteStorageNeedsSetup: true,
      remoteStorageUploadRateLimitMbps: 12,
    });
    expect(JSON.stringify(migration?.values)).not.toContain('do-not-reuse');
    expect(migration?.deleteKeys).toContain('cloudAccountPassword');
    expect(
      migrateLegacyRemoteStorage({ remoteStorageMigrationVersion: 1 }),
    ).toBeUndefined();
  });
});

describe('WebDavStorageProvider', () => {
  const request = jest.spyOn(axios, 'request');

  beforeEach(() => request.mockReset());
  afterAll(() => request.mockRestore());

  test('connection test checks read/write/delete and removes its marker', async () => {
    request.mockResolvedValue({ data: '' });
    const provider = new WebDavStorageProvider({
      ...config,
      serverUrl: 'http://dav.example.test/root/',
    });
    await expect(provider.testConnection()).resolves.toMatchObject({
      ok: true,
      canDelete: true,
      warning: expect.stringContaining('HTTP'),
    });
    expect(request.mock.calls.some(([call]) => call.method === 'PUT')).toBe(
      true,
    );
    expect(request.mock.calls.some(([call]) => call.method === 'GET')).toBe(
      true,
    );
    expect(request.mock.calls.some(([call]) => call.method === 'DELETE')).toBe(
      true,
    );
  });

  test.each([
    [401, undefined, 'AUTH'],
    [undefined, 'ETIMEDOUT', 'TIMEOUT'],
  ])('returns structured connection errors', async (status, code, expected) => {
    const error = new AxiosError(
      'request failed',
      code,
      undefined,
      undefined,
      status
        ? ({ status, data: {}, headers: {}, config: {} } as never)
        : undefined,
    );
    request.mockRejectedValue(error);
    const provider = new WebDavStorageProvider(config);
    await expect(provider.testConnection()).resolves.toMatchObject({
      ok: false,
      code: expected,
    });
  });

  test('reads standard WebDAV quota properties', async () => {
    request.mockResolvedValue({
      data: `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">
        <d:response><d:propstat><d:prop>
          <d:quota-used-bytes>3221225472</d:quota-used-bytes>
          <d:quota-available-bytes>1073741824</d:quota-available-bytes>
        </d:prop></d:propstat></d:response>
      </d:multistatus>`,
    });
    const provider = new WebDavStorageProvider(config);

    await expect(provider.getQuota()).resolves.toEqual({
      usedBytes: 3221225472,
      availableBytes: 1073741824,
      totalBytes: 4294967296,
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PROPFIND',
        url: 'https://dav.example.test/root/',
        headers: { Depth: '0' },
      }),
    );
  });

  test('treats omitted quota properties as unsupported', async () => {
    request.mockResolvedValue({ data: '<d:multistatus xmlns:d="DAV:" />' });
    const provider = new WebDavStorageProvider(config);

    await expect(provider.getQuota()).resolves.toBeUndefined();
  });

  test('maps HTTP 507 uploads to a sanitized storage error', async () => {
    jest.spyOn(fs.promises, 'stat').mockResolvedValue({
      size: 100,
      mtimeMs: 123,
    } as fs.Stats);
    jest
      .spyOn(fs, 'createReadStream')
      .mockReturnValue(Readable.from(Buffer.alloc(100)) as fs.ReadStream);
    request.mockImplementation(async (call) => {
      if (call.method === 'PUT' && String(call.url).endsWith('.mp4')) {
        throw new AxiosError(
          'Request failed with status code 507 at https://user:secret@example.test',
          undefined,
          undefined,
          undefined,
          { status: 507, data: {}, headers: {}, config: {} } as never,
        );
      }
      return { data: '' };
    });
    const provider = new WebDavStorageProvider(config);

    await expect(
      provider.uploadVideo('/recordings/raid.mp4', metadata, -1, jest.fn()),
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_STORAGE',
      message: 'The remote storage does not have enough free space',
    });
    expect(
      request.mock.calls.some(
        ([call]) => call.method === 'PUT' && String(call.url).endsWith('.json'),
      ),
    ).toBe(false);
  });

  test.each([true, false])(
    'persists Nextcloud protection=%s with an ETag precondition',
    async (protect) => {
      request.mockImplementation(async (call) => {
        if (call.method === 'GET') {
          return {
            data: { ...metadata, protected: !protect },
            headers: { etag: '"metadata-v1"' },
          };
        }
        return { data: '', headers: {} };
      });
      const provider = new WebDavStorageProvider({
        ...config,
        provider: 'nextcloud',
        serverUrl: 'https://cloud.example.test',
      });

      await provider.protectVideos(['raid'], protect);

      expect(provider.capabilities.protection).toBe(true);
      const put = request.mock.calls
        .map(([call]) => call)
        .find((call) => call.method === 'PUT');
      expect(put).toMatchObject({
        url: expect.stringMatching(/\/raid\.json$/),
        headers: {
          'Content-Type': 'application/json',
          'If-Match': '"metadata-v1"',
        },
      });
      expect(JSON.parse(String(put?.data))).toMatchObject({
        protected: protect,
      });
    },
  );

  test('retries a conflicting Nextcloud protection update', async () => {
    let putAttempts = 0;
    let getAttempts = 0;
    request.mockImplementation(async (call) => {
      if (call.method === 'GET') {
        getAttempts += 1;
        return {
          data: metadata,
          headers: { etag: `"metadata-v${getAttempts}"` },
        };
      }
      if (call.method === 'PUT' && putAttempts++ === 0) {
        throw new AxiosError(
          'metadata changed',
          undefined,
          undefined,
          undefined,
          { status: 412, data: {}, headers: {}, config: {} } as never,
        );
      }
      return { data: '', headers: {} };
    });
    const provider = new WebDavStorageProvider({
      ...config,
      provider: 'nextcloud',
      serverUrl: 'https://cloud.example.test',
    });

    await provider.protectVideos(['raid'], true);

    expect(getAttempts).toBe(2);
    expect(putAttempts).toBe(2);
    const puts = request.mock.calls
      .map(([call]) => call)
      .filter((call) => call.method === 'PUT');
    expect(puts[1].headers?.['If-Match']).toBe('"metadata-v2"');
  });

  test('falls back to an existing-resource precondition for unstable Nextcloud ETags', async () => {
    let putAttempts = 0;
    let getAttempts = 0;
    request.mockImplementation(async (call) => {
      if (call.method === 'GET') {
        getAttempts += 1;
        return {
          data: metadata,
          headers: { etag: `"unstable-${getAttempts}"` },
        };
      }
      if (call.method === 'PUT' && putAttempts++ < 2) {
        throw new AxiosError(
          'precondition failed',
          undefined,
          undefined,
          undefined,
          { status: 412, data: {}, headers: {}, config: {} } as never,
        );
      }
      return { data: '', headers: {} };
    });
    const provider = new WebDavStorageProvider({
      ...config,
      provider: 'nextcloud',
      serverUrl: 'https://cloud.example.test',
    });

    await provider.protectVideos(['raid'], true);

    expect(getAttempts).toBe(3);
    expect(putAttempts).toBe(3);
    const puts = request.mock.calls
      .map(([call]) => call)
      .filter((call) => call.method === 'PUT');
    expect(puts.map((call) => call.headers?.['If-Match'])).toEqual([
      '"unstable-1"',
      '"unstable-2"',
      '*',
    ]);
  });

  test('does not expose protection for generic WebDAV', async () => {
    const provider = new WebDavStorageProvider(config);

    expect(provider.capabilities.protection).toBe(false);
    await expect(provider.protectVideos(['raid'], true)).rejects.toThrow(
      'does not support protection',
    );
    expect(request).not.toHaveBeenCalled();
  });

  test('lists only complete MP4 and valid JSON pairs', async () => {
    const xml = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">
      <d:response><d:href>/root/LappenRecorder/videos/raid.mp4</d:href><d:propstat><d:prop><d:getcontentlength>100</d:getcontentlength></d:prop></d:propstat></d:response>
      <d:response><d:href>/root/LappenRecorder/videos/raid.json</d:href><d:propstat><d:prop><d:getlastmodified>Wed, 22 Jul 2026 12:00:00 GMT</d:getlastmodified></d:prop></d:propstat></d:response>
      <d:response><d:href>/root/LappenRecorder/videos/orphan.json</d:href></d:response>
    </d:multistatus>`;
    request.mockImplementation(async (call) => {
      if (call.method === 'PROPFIND' && call.headers?.Depth === '1') {
        return { data: xml };
      }
      if (call.method === 'GET') return { data: metadata };
      return { data: '' };
    });
    const provider = new WebDavStorageProvider(config);
    const videos = await provider.listVideos();
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({
      videoName: 'raid',
      videoSource: 'remote-vod://wcr/raid',
      size: 100,
      cloud: true,
    });
  });

  test('streams video ranges through authenticated provider requests', async () => {
    const data = Readable.from(Buffer.from('mp4'));
    request.mockResolvedValue({
      data,
      status: 206,
      headers: {
        'content-length': '3',
        'content-range': 'bytes 0-2/3',
      },
    });
    const provider = new WebDavStorageProvider(config);
    await expect(
      provider.streamVideo('raid', 'bytes=0-2'),
    ).resolves.toMatchObject({
      data,
      status: 206,
      contentLength: '3',
      contentRange: 'bytes 0-2/3',
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://dav.example.test/root/LappenRecorder/videos/raid.mp4',
        method: 'GET',
        headers: { Range: 'bytes=0-2' },
        auth: { username: 'user', password: 'secret' },
        responseType: 'stream',
      }),
    );
  });

  test('uploads MP4 before metadata and supports retry after a partial failure', async () => {
    jest.spyOn(fs.promises, 'stat').mockResolvedValue({
      size: 3,
      mtimeMs: 123,
    } as fs.Stats);
    jest
      .spyOn(fs, 'createReadStream')
      .mockReturnValue(Readable.from(Buffer.from('mp4')) as fs.ReadStream);
    let metadataFailures = 1;
    request.mockImplementation(async (call) => {
      if (
        call.method === 'PUT' &&
        String(call.url).endsWith('.json') &&
        metadataFailures-- > 0
      ) {
        throw new Error('metadata upload failed');
      }
      return { data: '' };
    });
    const provider = new WebDavStorageProvider(config);
    await expect(
      provider.uploadVideo('/recordings/raid.mp4', metadata, -1, jest.fn()),
    ).rejects.toThrow('metadata upload failed');
    await expect(
      provider.uploadVideo('/recordings/raid.mp4', metadata, -1, jest.fn()),
    ).resolves.toBeUndefined();

    const puts = request.mock.calls
      .map(([call]) => call)
      .filter((call) => call.method === 'PUT')
      .map((call) => String(call.url));
    expect(puts[0]).toMatch(/raid\.mp4$/);
    expect(puts[1]).toMatch(/raid\.json$/);
    expect(puts.filter((url) => url.endsWith('raid.mp4'))).toHaveLength(2);

    const videoPuts = request.mock.calls
      .map(([call]) => call)
      .filter(
        (call) =>
          call.method === 'PUT' && String(call.url).endsWith('raid.mp4'),
      );
    const metadataPut = request.mock.calls
      .map(([call]) => call)
      .find(
        (call) =>
          call.method === 'PUT' && String(call.url).endsWith('raid.json'),
      );
    expect(videoPuts.every((call) => call.timeout === 0)).toBe(true);
    expect(metadataPut?.timeout).toBe(config.timeoutMs);
  });

  test('reserves upload progress for server acknowledgement and finalization', async () => {
    jest.spyOn(fs.promises, 'stat').mockResolvedValue({
      size: 100,
      mtimeMs: 123,
    } as fs.Stats);
    jest
      .spyOn(fs, 'createReadStream')
      .mockReturnValue(Readable.from(Buffer.alloc(100)) as fs.ReadStream);
    request.mockImplementation(async (call) => {
      if (call.method === 'PUT' && String(call.url).endsWith('.mp4')) {
        call.onUploadProgress?.({ loaded: 100, total: 100 } as never);
      }
      return { data: '' };
    });
    const progress: number[] = [];
    const provider = new WebDavStorageProvider(config);

    await provider.uploadVideo('/recordings/raid.mp4', metadata, -1, (value) =>
      progress.push(value),
    );

    expect(progress).toEqual([95, 96, 98, 100]);
  });

  test('chunks large Nextcloud uploads and retries only the failed chunk', async () => {
    const chunkSize = 64 * 1024 ** 2;
    const videoSize = 4 * chunkSize;
    jest.spyOn(fs.promises, 'stat').mockResolvedValue({
      size: videoSize,
      mtimeMs: 123,
    } as fs.Stats);
    const createReadStream = jest
      .spyOn(fs, 'createReadStream')
      .mockImplementation(() => Readable.from([]) as fs.ReadStream);
    createReadStream.mockClear();
    let firstChunkFailures = 1;
    request.mockImplementation(async (call) => {
      const url = String(call.url);
      if (call.method === 'PROPFIND' && url.includes('/dav/uploads/')) {
        return { data: '' };
      }
      if (call.method === 'PUT' && url.includes('/dav/uploads/')) {
        const size = Number(call.headers?.['Content-Length']);
        call.onUploadProgress?.({ loaded: size, total: size } as never);
        if (url.endsWith('000000000000000-000000067108863')) {
          if (firstChunkFailures-- > 0) {
            const error = new AxiosError('temporary upload failure');
            Object.assign(error, { response: { status: 503 } });
            throw error;
          }
        }
      }
      return { data: '' };
    });
    const progress: number[] = [];
    const provider = new WebDavStorageProvider({
      ...config,
      provider: 'nextcloud',
      serverUrl:
        'https://cloud.example.test/remote.php/dav/files/storage-user-id',
    });

    await provider.uploadVideo('/recordings/raid.mp4', metadata, -1, (value) =>
      progress.push(value),
    );

    const calls = request.mock.calls.map(([call]) => call);
    const chunkPuts = calls.filter(
      (call) =>
        call.method === 'PUT' && String(call.url).includes('/dav/uploads/'),
    );
    expect(chunkPuts).toHaveLength(5);
    expect(String(chunkPuts[0].url)).toContain(
      '/remote.php/dav/uploads/storage-user-id/',
    );
    expect(
      chunkPuts.every(
        (call) =>
          call.headers?.['OC-Total-Length'] === videoSize && call.timeout === 0,
      ),
    ).toBe(true);
    const move = calls.find((call) => call.method === 'MOVE');
    expect(move).toMatchObject({
      headers: {
        Destination:
          'https://cloud.example.test/remote.php/dav/files/storage-user-id/LappenRecorder/videos/raid.mp4',
        'OC-Total-Length': videoSize,
      },
      timeout: 0,
    });
    const metadataPutIndex = calls.findIndex(
      (call) =>
        call.method === 'PUT' && String(call.url).endsWith('/raid.json'),
    );
    expect(calls.findIndex((call) => call.method === 'MOVE')).toBeLessThan(
      metadataPutIndex,
    );
    expect(progress).toContain(95);
    expect(progress.slice(-3)).toEqual([96, 98, 100]);
    expect(createReadStream).toHaveBeenCalledTimes(5);
  });

  test('resumes a Nextcloud upload from validated existing chunks', async () => {
    const chunkSize = 64 * 1024 ** 2;
    const videoSize = 4 * chunkSize;
    const firstChunkName = '000000000000000-000000067108863';
    jest.spyOn(fs.promises, 'stat').mockResolvedValue({
      size: videoSize,
      mtimeMs: 123,
    } as fs.Stats);
    const createReadStream = jest
      .spyOn(fs, 'createReadStream')
      .mockImplementation(() => Readable.from([]) as fs.ReadStream);
    createReadStream.mockClear();
    request.mockImplementation(async (call) => {
      const url = String(call.url);
      if (call.method === 'PROPFIND' && url.includes('/dav/uploads/')) {
        return {
          data: `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">
            <d:response><d:href>${url}${firstChunkName}</d:href><d:propstat><d:prop><d:getcontentlength>${chunkSize}</d:getcontentlength></d:prop></d:propstat></d:response>
          </d:multistatus>`,
        };
      }
      if (call.method === 'PUT' && url.includes('/dav/uploads/')) {
        const size = Number(call.headers?.['Content-Length']);
        call.onUploadProgress?.({ loaded: size, total: size } as never);
      }
      return { data: '' };
    });
    const provider = new WebDavStorageProvider({
      ...config,
      provider: 'nextcloud',
      serverUrl: 'https://cloud.example.test',
    });

    await provider.uploadVideo('/recordings/raid.mp4', metadata, -1, jest.fn());

    const chunkPuts = request.mock.calls
      .map(([call]) => call)
      .filter(
        (call) =>
          call.method === 'PUT' && String(call.url).includes('/dav/uploads/'),
      );
    expect(chunkPuts).toHaveLength(3);
    expect(createReadStream).toHaveBeenCalledTimes(3);
    expect(createReadStream.mock.calls[0][1]).toMatchObject({
      start: chunkSize,
      end: 2 * chunkSize - 1,
    });
  });

  test('reports partial delete failures', async () => {
    request.mockImplementation(async (call) => {
      if (call.method === 'DELETE' && String(call.url).endsWith('.json')) {
        const error = new AxiosError('denied');
        Object.assign(error, { response: { status: 500 } });
        throw error;
      }
      return { data: '' };
    });
    const provider = new WebDavStorageProvider(config);
    await expect(provider.deleteVideos(['raid'])).rejects.toThrow(
      'partially successful',
    );
  });

  test('stores, reads, and deletes validated per-video chat messages', async () => {
    let stored: unknown[] | undefined;
    request.mockImplementation(async (call) => {
      const url = String(call.url);
      if (call.method === 'GET' && url.endsWith('/chats/raid.json')) {
        if (!stored) {
          const error = new AxiosError('not found');
          Object.assign(error, { response: { status: 404 } });
          throw error;
        }
        return { data: stored, headers: { etag: '"chat-version"' } };
      }
      if (call.method === 'PUT' && url.endsWith('/chats/raid.json')) {
        stored = JSON.parse(String(call.data));
      }
      return { data: '', headers: {} };
    });
    const provider = new WebDavStorageProvider(config);
    expect(provider.capabilities.chat).toBe(true);

    const created = await provider.addChatMessage('raid', 'user', '02:15 nice');
    expect(created).toMatchObject({
      correlator: 'raid',
      userName: 'user',
      message: '02:15 nice',
    });
    await expect(provider.getChatMessages('raid')).resolves.toEqual([created]);

    await provider.deleteChatMessage('raid', created.id);
    await expect(provider.getChatMessages('raid')).resolves.toEqual([]);
    expect(
      request.mock.calls.some(
        ([call]) =>
          call.method === 'PUT' &&
          call.headers?.['If-Match'] === '"chat-version"',
      ),
    ).toBe(true);
  });

  test('rejects malformed remote chat documents', async () => {
    request.mockImplementation(async (call) => {
      if (call.method === 'GET') return { data: [{ message: 'incomplete' }] };
      return { data: '' };
    });
    const provider = new WebDavStorageProvider(config);
    await expect(provider.getChatMessages('raid')).rejects.toThrow(
      'Invalid remote chat data',
    );
  });

  test('rejects oversized remote chat documents', async () => {
    request.mockResolvedValue({
      data: Array.from({ length: 1001 }, (_, id) => ({
        id,
        correlator: 'raid',
        userName: 'user',
        message: 'message',
        timestamp: id,
      })),
      headers: {},
    });
    const provider = new WebDavStorageProvider(config);

    await expect(provider.getChatMessages('raid')).rejects.toThrow(
      'Invalid remote chat data',
    );
    const chatRead = request.mock.calls.find(
      ([call]) =>
        call.method === 'GET' && String(call.url).endsWith('/chats/raid.json'),
    );
    expect(chatRead?.[0].maxContentLength).toBe(1024 * 1024);
  });

  test('creates and reuses read-only Nextcloud public share links', async () => {
    const provider = new WebDavStorageProvider({
      ...config,
      provider: 'nextcloud',
      serverUrl: 'https://cloud.example.test/nextcloud',
      basePath: 'Team Recordings',
    });
    expect(provider.capabilities.shareLinks).toBe(true);

    request
      .mockResolvedValueOnce({ data: { ocs: { data: [] } } })
      .mockResolvedValueOnce({
        data: { ocs: { data: { url: 'https://cloud.example.test/s/abc' } } },
      })
      .mockResolvedValueOnce({
        data: {
          ocs: {
            data: [
              {
                share_type: 3,
                url: 'https://cloud.example.test/s/abc',
              },
            ],
          },
        },
      });

    await expect(provider.createShareLink('raid')).resolves.toBe(
      'https://cloud.example.test/s/abc',
    );
    const createCall = request.mock.calls[1][0];
    expect(createCall.url).toBe(
      'https://cloud.example.test/nextcloud/ocs/v2.php/apps/files_sharing/api/v1/shares',
    );
    expect(createCall.data).toContain(
      'path=%2FTeam+Recordings%2Fvideos%2Fraid.mp4',
    );
    expect(createCall.data).toContain('shareType=3');
    expect(createCall.data).toContain('permissions=1');

    await expect(provider.createShareLink('raid')).resolves.toBe(
      'https://cloud.example.test/s/abc',
    );
    expect(request).toHaveBeenCalledTimes(3);
  });

  test('does not advertise share links for generic WebDAV', async () => {
    const provider = new WebDavStorageProvider(config);
    expect(provider.capabilities.shareLinks).toBe(false);
    await expect(provider.createShareLink('raid')).rejects.toThrow(
      'does not support share links',
    );
    expect(request).not.toHaveBeenCalled();
  });

  test('rejects non-normalized Nextcloud share-link video names', async () => {
    const provider = new WebDavStorageProvider({
      ...config,
      provider: 'nextcloud',
      serverUrl: 'https://cloud.example.test/nextcloud',
    });

    await expect(provider.createShareLink('../raid')).rejects.toThrow(
      'Invalid remote video name',
    );
    expect(request).not.toHaveBeenCalled();
  });
});
