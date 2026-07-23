import type { RendererVideo } from '../../main/types';
import RemoteStorageRetentionMonitor, {
  selectRemoteVideosForRetention,
} from '../../storage/RemoteStorageRetentionMonitor';
import type { RemoteStorageCapabilities } from '../../storage/remote/RemoteStorageProvider';

const video = (
  videoName: string,
  size: number | undefined,
  mtime: number,
  isProtected = false,
) =>
  ({
    videoName,
    size,
    mtime,
    isProtected,
    cloud: true,
  }) as RendererVideo;

const capabilities: RemoteStorageCapabilities = {
  list: true,
  upload: true,
  download: true,
  delete: true,
  shareLinks: false,
  tags: false,
  protection: false,
  chat: false,
  quota: true,
};

describe('RemoteStorageRetentionMonitor', () => {
  test('selects oldest recordings until managed usage is below 95% of the limit', () => {
    const selected = selectRemoteVideosForRetention(
      [
        video('newest', 600, 3),
        video('oldest', 100, 1),
        video('middle', 200, 2),
        video('protected', 300, 0.5, true),
      ],
      1000,
    );

    expect(selected.map((entry) => entry.videoName)).toEqual([
      'oldest',
      'middle',
    ]);
  });

  test('never selects protected, unsized, or undated recordings', () => {
    const selected = selectRemoteVideosForRetention(
      [
        video('protected', 800, 1, true),
        video('unknown-size', undefined, 2),
        video('unknown-date', 500, 0),
        video('eligible', 200, 3),
      ],
      500,
    );

    expect(selected.map((entry) => entry.videoName)).toEqual(['eligible']);
  });

  test('reserves capacity for an incoming upload', () => {
    const selected = selectRemoteVideosForRetention(
      [video('newer', 400, 2), video('older', 400, 1)],
      1000,
      300,
    );

    expect(selected.map((entry) => entry.videoName)).toEqual(['older']);
  });

  test.each([
    { enabled: false, uploadsActive: false },
    { enabled: true, uploadsActive: true },
  ])('does not list or delete when cleanup cannot run: %o', async (options) => {
    const listVideos = jest.fn().mockResolvedValue([video('old', 200, 1)]);
    const deleteVideos = jest.fn().mockResolvedValue(undefined);
    const monitor = new RemoteStorageRetentionMonitor({
      capabilities,
      ready: jest.fn().mockResolvedValue(true),
      listVideos,
      deleteVideos,
    });

    await expect(monitor.run({ ...options, limitBytes: 100 })).resolves.toEqual(
      [],
    );
    expect(listVideos).not.toHaveBeenCalled();
    expect(deleteVideos).not.toHaveBeenCalled();
  });

  test('checks capabilities before accessing remote recordings', async () => {
    const listVideos = jest.fn();
    const monitor = new RemoteStorageRetentionMonitor({
      capabilities: { ...capabilities, delete: false },
      ready: jest.fn().mockResolvedValue(true),
      listVideos,
      deleteVideos: jest.fn(),
    });

    await expect(
      monitor.run({ enabled: true, uploadsActive: false, limitBytes: 100 }),
    ).resolves.toEqual([]);
    expect(listVideos).not.toHaveBeenCalled();
  });

  test('deletes selected names in age order', async () => {
    const deleteVideos = jest.fn().mockResolvedValue(undefined);
    const monitor = new RemoteStorageRetentionMonitor({
      capabilities,
      ready: jest.fn().mockResolvedValue(true),
      listVideos: jest
        .fn()
        .mockResolvedValue([video('new', 700, 2), video('old', 400, 1)]),
      deleteVideos,
    });

    await expect(
      monitor.run({ enabled: true, uploadsActive: false, limitBytes: 1000 }),
    ).resolves.toEqual(['old']);
    expect(deleteVideos).toHaveBeenCalledWith(['old']);
  });

  test('contains provider failures without retrying deletion', async () => {
    const deleteVideos = jest.fn().mockRejectedValue(new Error('denied'));
    const monitor = new RemoteStorageRetentionMonitor({
      capabilities,
      ready: jest.fn().mockResolvedValue(true),
      listVideos: jest.fn().mockResolvedValue([video('old', 1100, 1)]),
      deleteVideos,
    });

    await expect(
      monitor.run({ enabled: true, uploadsActive: false, limitBytes: 1000 }),
    ).resolves.toEqual([]);
    expect(deleteVideos).toHaveBeenCalledTimes(1);
  });

  test('contains readiness failures without listing or deleting', async () => {
    const listVideos = jest.fn();
    const deleteVideos = jest.fn();
    const monitor = new RemoteStorageRetentionMonitor({
      capabilities,
      ready: jest.fn().mockRejectedValue(new Error('offline')),
      listVideos,
      deleteVideos,
    });

    await expect(
      monitor.run({ enabled: true, uploadsActive: false, limitBytes: 1000 }),
    ).resolves.toEqual([]);
    expect(listVideos).not.toHaveBeenCalled();
    expect(deleteVideos).not.toHaveBeenCalled();
  });
});
