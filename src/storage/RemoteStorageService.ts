import path from 'path';
import { Readable } from 'stream';
import { clipboard, ipcMain } from 'electron';
import ConfigService from 'config/ConfigService';
import {
  CloudStatus,
  Metadata,
  RendererVideo,
  UploadQueueItem,
} from 'main/types';
import VideoProcessQueue from 'main/VideoProcessQueue';
import { send } from 'main/main';
import { getMetadataForVideo } from 'main/util';
import StorageClient from './StorageClient';
import DisabledStorageProvider from './remote/DisabledStorageProvider';
import { createRemoteStorageProvider } from './remote/RemoteStorageProviderFactory';
import {
  ProgressCallback,
  RemoteStorageProvider,
} from './remote/RemoteStorageProvider';
import RemoteStorageSecretStore from './remote/RemoteStorageSecretStore';
import {
  redactRemoteStorageError,
  sanitizeRemoteFileName,
} from './remote/remoteStorageUtils';

export default class RemoteStorageService implements StorageClient {
  private static instance: RemoteStorageService;
  private provider: RemoteStorageProvider = new DisabledStorageProvider();
  private configurationError: string | undefined;
  private readonly cfg = ConfigService.getInstance();
  private readonly secrets = new RemoteStorageSecretStore();

  static getInstance() {
    if (!this.instance) this.instance = new this();
    return this.instance;
  }

  private constructor() {
    this.configure();
    this.setupListeners();
  }

  configure() {
    this.configurationError = undefined;
    try {
      this.provider = createRemoteStorageProvider(
        {
          remoteStorageEnabled: this.cfg.get('remoteStorageEnabled'),
          remoteStorageProvider: this.cfg.get('remoteStorageProvider'),
          webdavServerUrl: this.cfg.get('webdavServerUrl'),
          webdavUsername: this.cfg.get('webdavUsername'),
          webdavBasePath: this.cfg.get('webdavBasePath'),
        },
        this.secrets.getPassword(),
      );
    } catch (error) {
      this.configurationError = redactRemoteStorageError(error);
      console.warn(
        '[RemoteStorage] Configuration is invalid',
        this.configurationError,
      );
      this.provider = new DisabledStorageProvider();
    }
  }

  get capabilities() {
    return this.provider.capabilities;
  }

  ready() {
    return this.provider.ready();
  }

  async refreshStatus() {
    const enabled = this.cfg.get<boolean>('remoteStorageEnabled');
    const ready = enabled && (await this.ready());
    const capabilities = this.provider.capabilities;
    const status: CloudStatus = {
      enabled,
      authenticated: ready,
      authorized: ready,
      guild: this.provider.id,
      available: [],
      read: ready && capabilities.list,
      write: ready && capabilities.upload,
      del: ready && capabilities.delete,
      usage: 0,
      limit: 0,
      migrated: false,
      shareLinks: capabilities.shareLinks,
      chat: false,
      tags: capabilities.tags,
      protection: capabilities.protection,
    };
    send('updateCloudStatus', status);
  }

  async refreshVideos() {
    if (!(await this.ready())) {
      send('setCloudVideos', []);
      return;
    }
    try {
      send('setCloudVideos', await this.provider.listVideos());
    } catch (error) {
      console.warn(
        '[RemoteStorage] Failed to list videos',
        redactRemoteStorageError(error),
      );
      send('setCloudVideos', []);
    }
  }

  deleteVideos(videoNames: string[]) {
    return this.provider.deleteVideos(videoNames);
  }

  async tagVideos(videoNames: string[], tag: string) {
    void videoNames;
    void tag;
    throw new Error('The active remote storage provider does not support tags');
  }

  async protectVideos(videoNames: string[], protect: boolean) {
    void videoNames;
    void protect;
    throw new Error(
      'The active remote storage provider does not support protection',
    );
  }

  uploadVideo(
    videoPath: string,
    metadata: Metadata,
    rateLimitMbps: number,
    onProgress: ProgressCallback,
  ) {
    return this.provider.uploadVideo(
      videoPath,
      metadata,
      rateLimitMbps,
      onProgress,
    );
  }

  downloadVideo(
    video: RendererVideo,
    destinationPath: string,
    onProgress: ProgressCallback,
  ) {
    return this.provider.downloadVideo(video, destinationPath, onProgress);
  }

  async handleVideoRequest(request: Request): Promise<Response> {
    try {
      const prefix = 'remote-vod://wcr/';
      const encodedName = request.url.slice(prefix.length).split(/[?#]/, 1)[0];
      const videoName = decodeURIComponent(encodedName);
      if (!videoName || sanitizeRemoteFileName(videoName) !== videoName) {
        return new Response('', { status: 400, statusText: 'Bad video name' });
      }

      const range = request.headers.get('Range') ?? undefined;
      if (range && !/^bytes=\d*-\d*$/.test(range)) {
        return new Response('', { status: 416, statusText: 'Invalid range' });
      }

      const remote = await this.provider.streamVideo(videoName, range);
      const headers = new Headers({
        'Accept-Ranges': 'bytes',
        'Content-Type': 'video/mp4',
        'Cache-Control': 'no-cache',
      });
      if (remote.contentLength)
        headers.set('Content-Length', remote.contentLength);
      if (remote.contentRange)
        headers.set('Content-Range', remote.contentRange);

      return new Response(
        Readable.toWeb(remote.data as Readable) as ReadableStream<Uint8Array>,
        { status: remote.status, headers },
      );
    } catch (error) {
      console.warn(
        '[RemoteStorage] Failed to stream remote video',
        redactRemoteStorageError(error),
      );
      return new Response('', {
        status: 502,
        statusText: 'Remote video unavailable',
      });
    }
  }

  private isSafeLocalVideoPath(candidate: string) {
    const root = path.resolve(this.cfg.get<string>('storagePath'));
    const resolved = path.resolve(candidate);
    return (
      resolved.toLowerCase().endsWith('.mp4') &&
      (resolved === root || resolved.startsWith(`${root}${path.sep}`))
    );
  }

  private setupListeners() {
    ipcMain.on('reconfigureRemoteStorage', async () => {
      this.configure();
      await Promise.all([this.refreshStatus(), this.refreshVideos()]);
    });
    // Compatibility with older renderer builds during migration.
    ipcMain.on('reconfigureCloud', () => {
      this.configure();
      void this.refreshStatus();
      void this.refreshVideos();
    });

    ipcMain.handle('setRemoteStoragePassword', (_event, args) => {
      const password = Array.isArray(args) ? args[0] : '';
      if (typeof password !== 'string' || password.length > 4096) {
        throw new Error('Invalid password');
      }
      this.secrets.setPassword(password);
      this.configure();
      return { configured: this.secrets.hasPassword() };
    });

    ipcMain.handle('testRemoteStorageConnection', async () => {
      this.configure();
      if (this.configurationError) {
        return {
          ok: false,
          code: 'URL' as const,
          message: this.configurationError,
        };
      }
      return this.provider.testConnection();
    });

    ipcMain.handle('getShareableLink', async (_event, args) => {
      if (!this.provider.capabilities.shareLinks) {
        throw new Error(
          'The active remote storage provider does not support share links',
        );
      }
      if (!Array.isArray(args) || typeof args[0] !== 'string') {
        throw new Error('Invalid remote video name');
      }
      const videoName = sanitizeRemoteFileName(args[0]);
      try {
        const shareUrl = await this.provider.createShareLink(videoName);
        clipboard.writeText(shareUrl);
        return shareUrl;
      } catch (error) {
        throw new Error(redactRemoteStorageError(error));
      }
    });

    ipcMain.on('deleteVideosCloud', async (_event, args) => {
      if (!Array.isArray(args)) return;
      const names = (args as RendererVideo[])
        .filter((video) => video?.cloud && typeof video.videoName === 'string')
        .map((video) => sanitizeRemoteFileName(video.videoName));
      if (names.length) await this.deleteVideos(names);
      await this.refreshVideos();
    });

    ipcMain.on('videoButtonCloud', async (_event, args) => {
      if (!Array.isArray(args) || typeof args[0] !== 'string') return;
      const action = args[0];
      if (action === 'upload') {
        const source = args[1];
        if (typeof source !== 'string' || !this.isSafeLocalVideoPath(source)) {
          console.warn('[RemoteStorage] Rejected unsafe upload path');
          return;
        }
        const item: UploadQueueItem = { path: source };
        await VideoProcessQueue.getInstance().queueUpload(item);
      } else if (action === 'download') {
        const video = args[1] as RendererVideo;
        if (!video?.cloud || typeof video.videoName !== 'string') return;
        sanitizeRemoteFileName(video.videoName);
        await VideoProcessQueue.getInstance().queueDownload(video);
      }
    });
  }

  async uploadPath(
    videoPath: string,
    rateLimitMbps: number,
    onProgress: ProgressCallback,
  ) {
    const metadata = await getMetadataForVideo(videoPath);
    return this.uploadVideo(videoPath, metadata, rateLimitMbps, onProgress);
  }
}
