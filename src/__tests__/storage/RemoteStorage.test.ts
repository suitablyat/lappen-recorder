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
  basePath: 'WarcraftRecorder',
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

  test('lists only complete MP4 and valid JSON pairs', async () => {
    const xml = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">
      <d:response><d:href>/root/WarcraftRecorder/videos/raid.mp4</d:href><d:propstat><d:prop><d:getcontentlength>100</d:getcontentlength></d:prop></d:propstat></d:response>
      <d:response><d:href>/root/WarcraftRecorder/videos/raid.json</d:href><d:propstat><d:prop><d:getlastmodified>Wed, 22 Jul 2026 12:00:00 GMT</d:getlastmodified></d:prop></d:propstat></d:response>
      <d:response><d:href>/root/WarcraftRecorder/videos/orphan.json</d:href></d:response>
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
    expect(videos[0]).toMatchObject({ videoName: 'raid', cloud: true });
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
});
