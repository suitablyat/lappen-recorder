import { Flavour, Metadata } from '../../main/types';
import RemoteStorageService from '../../storage/RemoteStorageService';
import { VideoCategory } from '../../types/VideoCategory';

jest.mock('electron', () => ({
  clipboard: { writeText: jest.fn() },
  ipcMain: { handle: jest.fn(), on: jest.fn() },
}));
jest.mock('../../main/main', () => ({ send: jest.fn() }));
jest.mock('../../main/VideoProcessQueue', () => ({
  __esModule: true,
  default: { getInstance: jest.fn() },
}));

describe('RemoteStorageService', () => {
  test('refreshes status and videos after a successful upload', async () => {
    const providerUpload = jest.fn().mockResolvedValue(undefined);
    const refreshStatus = jest.fn().mockResolvedValue(undefined);
    const refreshVideos = jest.fn().mockResolvedValue(undefined);
    const service = {
      provider: { uploadVideo: providerUpload },
      remoteStorageError: 'INSUFFICIENT_STORAGE',
      enforceRetention: jest.fn().mockResolvedValue(undefined),
      refreshStatus,
      refreshVideos,
    } as unknown as RemoteStorageService;
    const metadata: Metadata = {
      category: VideoCategory.Manual,
      duration: 10,
      result: true,
      flavour: Flavour.Retail,
      combatants: [],
      overrun: 0,
      size: 1024,
    };

    await RemoteStorageService.prototype.uploadVideo.call(
      service,
      'recording.mp4',
      metadata,
      -1,
      jest.fn(),
    );

    expect(providerUpload).toHaveBeenCalledTimes(1);
    expect(refreshStatus).toHaveBeenCalledTimes(1);
    expect(refreshVideos).toHaveBeenCalledTimes(1);
  });

  test('redacts provider errors returned through chat IPC operations', async () => {
    const service = Object.assign(
      Object.create(RemoteStorageService.prototype),
      {
        provider: {
          capabilities: { chat: true },
          getChatMessages: jest
            .fn()
            .mockRejectedValue(new Error('password=super-secret')),
        },
      },
    ) as RemoteStorageService;

    await expect(
      RemoteStorageService.prototype.getChatMessages.call(service, 'raid'),
    ).rejects.toThrow('password=[REDACTED]');
  });
});
