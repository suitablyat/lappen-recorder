import path from 'path';
import fs from 'fs';
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
import type { TChatMessageWithId } from 'types/api';
import StorageClient from './StorageClient';
import RemoteStorageRetentionMonitor from './RemoteStorageRetentionMonitor';
import DisabledStorageProvider from './remote/DisabledStorageProvider';
import { createRemoteStorageProvider } from './remote/RemoteStorageProviderFactory';
import {
  ProgressCallback,
  RemoteStorageError,
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
  private remoteStorageError: 'INSUFFICIENT_STORAGE' | undefined;
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
    const quota =
      ready && capabilities.quota ? await this.provider.getQuota() : undefined;
    const status: CloudStatus = {
      enabled,
      authenticated: ready,
      authorized: ready,
      guild: this.provider.id,
      available: [],
      read: ready && capabilities.list,
      write: ready && capabilities.upload,
      del: ready && capabilities.delete,
      usage: quota?.usedBytes ?? 0,
      limit: quota?.totalBytes ?? 0,
      migrated: false,
      shareLinks: capabilities.shareLinks,
      chat: ready && capabilities.chat,
      tags: capabilities.tags,
      protection: capabilities.protection,
      quotaAvailable: Boolean(quota),
      remoteStorageError: this.remoteStorageError,
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

  async enforceRetention(reservedBytes = 0, beforeUpload = false) {
    const limitGb = this.cfg.get<number>('remoteStorageRetentionLimitGb');
    const limitBytes = limitGb * 1024 ** 3;
    const monitor = new RemoteStorageRetentionMonitor(this.provider);
    const deleted = await monitor.run({
      enabled:
        this.cfg.get<boolean>('remoteStorageEnabled') &&
        this.cfg.get<boolean>('remoteStorageRetentionEnabled'),
      limitBytes: Number.isSafeInteger(limitBytes) ? limitBytes : 0,
      uploadsActive:
        !beforeUpload && VideoProcessQueue.getInstance().hasPendingUploads(),
      reservedBytes,
    });

    if (deleted.length > 0) {
      this.remoteStorageError = undefined;
      await Promise.all([this.refreshStatus(), this.refreshVideos()]);
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
    if (!this.provider.capabilities.protection) {
      throw new Error(
        'The active remote storage provider does not support protection',
      );
    }
    const names = videoNames.map((name) => {
      const sanitized = sanitizeRemoteFileName(name);
      if (sanitized !== name) throw new Error('Invalid remote video name');
      return sanitized;
    });
    await this.provider.protectVideos(names, protect);
  }

  async uploadVideo(
    videoPath: string,
    metadata: Metadata,
    rateLimitMbps: number,
    onProgress: ProgressCallback,
  ) {
    try {
      const metadataSize = metadata.size;
      const incomingBytes =
        Number.isSafeInteger(metadataSize) && metadataSize! > 0
          ? metadataSize!
          : (await fs.promises.stat(videoPath)).size;
      await this.enforceRetention(incomingBytes, true);
      await this.provider.uploadVideo(
        videoPath,
        metadata,
        rateLimitMbps,
        onProgress,
      );
      this.remoteStorageError = undefined;
      // Publishing the updated remote list is what changes a correlated local
      // video into a local + remote video in the renderer. Without this refresh,
      // upload-dependent actions remain stale until the next full refresh.
      await Promise.all([this.refreshStatus(), this.refreshVideos()]);
    } catch (error) {
      if (
        error instanceof RemoteStorageError &&
        error.code === 'INSUFFICIENT_STORAGE'
      ) {
        this.remoteStorageError = error.code;
        await this.refreshStatus();
      }
      throw error;
    }
  }

  downloadVideo(
    video: RendererVideo,
    destinationPath: string,
    onProgress: ProgressCallback,
  ) {
    return this.provider.downloadVideo(video, destinationPath, onProgress);
  }

  getChatCorrelator(video: RendererVideo) {
    if (!video?.cloud || typeof video.videoName !== 'string') {
      throw new Error('Chat requires a remote video');
    }
    const correlator = sanitizeRemoteFileName(video.videoName);
    if (correlator !== video.videoName) throw new Error('Invalid remote video');
    return correlator;
  }

  async getChatMessages(correlator: string): Promise<TChatMessageWithId[]> {
    this.validateChatCorrelator(correlator);
    if (!this.provider.capabilities.chat) {
      throw new Error(
        'The active remote storage provider does not support chat',
      );
    }
    try {
      return await this.provider.getChatMessages(correlator);
    } catch (error) {
      throw new Error(redactRemoteStorageError(error));
    }
  }

  async addChatMessage(
    correlator: string,
    message: string,
  ): Promise<TChatMessageWithId> {
    this.validateChatCorrelator(correlator);
    if (
      typeof message !== 'string' ||
      !message.trim() ||
      message.length > 256
    ) {
      throw new Error('Invalid chat message');
    }
    if (!this.provider.capabilities.chat) {
      throw new Error(
        'The active remote storage provider does not support chat',
      );
    }
    const userName =
      this.cfg.get<string>('webdavUsername').trim().slice(0, 128) ||
      'Remote user';
    try {
      return await this.provider.addChatMessage(
        correlator,
        userName,
        message.trim(),
      );
    } catch (error) {
      throw new Error(redactRemoteStorageError(error));
    }
  }

  async deleteChatMessage(correlator: string, id: number): Promise<void> {
    this.validateChatCorrelator(correlator);
    if (!Number.isSafeInteger(id) || id < 0) throw new Error('Invalid chat id');
    if (!this.provider.capabilities.chat) {
      throw new Error(
        'The active remote storage provider does not support chat',
      );
    }
    try {
      await this.provider.deleteChatMessage(correlator, id);
    } catch (error) {
      throw new Error(redactRemoteStorageError(error));
    }
  }

  private validateChatCorrelator(correlator: string) {
    if (
      typeof correlator !== 'string' ||
      correlator.length > 240 ||
      sanitizeRemoteFileName(correlator) !== correlator
    ) {
      throw new Error('Invalid chat correlator');
    }
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
      await this.enforceRetention();
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
      if (videoName !== args[0]) throw new Error('Invalid remote video name');
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
      this.remoteStorageError = undefined;
      await this.refreshStatus();
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
      } else if (action === 'protect') {
        const protect = args[1];
        const videos = args[2];
        if (typeof protect !== 'boolean' || !Array.isArray(videos)) return;
        const names = (videos as RendererVideo[])
          .filter(
            (video) => video?.cloud && typeof video.videoName === 'string',
          )
          .map((video) => video.videoName);
        if (names.length === 0) return;

        try {
          await this.protectVideos(names, protect);
          send(
            protect
              ? 'displayProtectCloudVideos'
              : 'displayUnprotectCloudVideos',
            names,
          );
        } catch (error) {
          console.warn(
            '[RemoteStorage] Failed to update protection',
            redactRemoteStorageError(error),
          );
        } finally {
          await this.refreshVideos();
        }
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
