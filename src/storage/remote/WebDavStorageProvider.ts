import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Metadata, RendererVideo } from '../../main/types';
import { ChatMessageWithId, TChatMessageWithId } from '../../types/api';
import {
  ProgressCallback,
  RemoteStorageError,
  RemoteStorageProvider,
  RemoteStorageQuota,
  RemoteStorageTestErrorCode,
  RemoteStorageTestResult,
  RemoteVideoStream,
} from './RemoteStorageProvider';
import {
  normalizeBasePath,
  normalizeWebDavEndpoint,
  redactRemoteStorageError,
  sanitizeRemoteFileName,
} from './remoteStorageUtils';

export type WebDavStorageConfig = {
  provider: 'webdav' | 'nextcloud';
  serverUrl: string;
  username: string;
  password: string;
  basePath: string;
  timeoutMs?: number;
};

type DavEntry = { href: string; name: string; size: number; modified: number };
type ChatDocument = {
  messages: TChatMessageWithId[];
  etag?: string;
  exists: boolean;
};

type NextcloudShare = { share_type?: number; url?: string };
type NextcloudOcsResponse<T> = {
  ocs?: {
    meta?: { status?: string; statuscode?: number; message?: string };
    data?: T;
  };
};
type NextcloudShareListResponse = NextcloudOcsResponse<NextcloudShare[]>;

const NEXTCLOUD_CHUNK_THRESHOLD_BYTES = 256 * 1024 ** 2;
const NEXTCLOUD_CHUNK_SIZE_BYTES = 64 * 1024 ** 2;
const NEXTCLOUD_CHUNK_UPLOAD_ATTEMPTS = 3;
const VIDEO_UPLOAD_PROGRESS_PERCENT = 95;

const decodeXml = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

export default class WebDavStorageProvider implements RemoteStorageProvider {
  readonly id: string;
  readonly capabilities = {
    list: true,
    upload: true,
    download: true,
    delete: true,
    shareLinks: false,
    tags: false,
    protection: false,
    chat: true,
    quota: true,
  };

  private readonly endpoint: string;
  private readonly videosUrl: string;
  private readonly chatsUrl: string;
  private readonly insecure: boolean;
  private readonly username: string;
  private readonly password: string;
  private readonly timeoutMs: number;
  private readonly provider: 'webdav' | 'nextcloud';
  private readonly basePath: string;
  private readonly nextcloudSharesUrl?: string;
  private readonly nextcloudUploadsUrl?: string;
  private chatMutationQueue: Promise<void> = Promise.resolve();
  private chatsCollectionReady = false;

  constructor(config: WebDavStorageConfig) {
    const normalized = normalizeWebDavEndpoint(
      config.serverUrl,
      config.provider,
      config.username,
    );
    const basePath = normalizeBasePath(config.basePath);
    this.id = config.provider;
    this.provider = config.provider;
    this.basePath = basePath;
    this.endpoint = normalized.endpoint;
    this.insecure = normalized.insecure;
    this.username = config.username.trim();
    this.password = config.password;
    this.timeoutMs = config.timeoutMs ?? 15000;
    this.videosUrl = new URL(`${basePath}/videos/`, this.endpoint).toString();
    this.chatsUrl = new URL(`${basePath}/chats/`, this.endpoint).toString();
    this.capabilities.shareLinks = config.provider === 'nextcloud';

    if (config.provider === 'nextcloud') {
      const endpointUrl = new URL(this.endpoint);
      const remotePhpIndex = endpointUrl.pathname.indexOf('/remote.php/');
      const installationPath =
        remotePhpIndex >= 0
          ? endpointUrl.pathname.slice(0, remotePhpIndex)
          : endpointUrl.pathname.replace(/\/$/, '');
      const endpointUserId = endpointUrl.pathname.match(
        /\/remote\.php\/dav\/files\/([^/]+)\/?$/i,
      )?.[1];
      this.nextcloudSharesUrl = new URL(
        `${installationPath}/ocs/v2.php/apps/files_sharing/api/v1/shares`,
        endpointUrl.origin,
      ).toString();
      this.nextcloudUploadsUrl = new URL(
        `${installationPath}/remote.php/dav/uploads/${
          endpointUserId ?? encodeURIComponent(this.username)
        }/`,
        endpointUrl.origin,
      ).toString();
    }
  }

  private async request<T = unknown>(config: AxiosRequestConfig) {
    try {
      return await axios.request<T>({
        ...config,
        auth: { username: this.username, password: this.password },
        timeout: config.timeout ?? this.timeoutMs,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
    } catch (error) {
      if ((error as AxiosError).response?.status === 507) {
        throw new RemoteStorageError(
          'INSUFFICIENT_STORAGE',
          'The remote storage does not have enough free space',
        );
      }
      throw error;
    }
  }

  private async propfind(url: string, depth: 0 | 1) {
    return this.request<string>({
      url,
      method: 'PROPFIND',
      headers: { Depth: String(depth) },
      data: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>',
      responseType: 'text',
    });
  }

  async getQuota(): Promise<RemoteStorageQuota | undefined> {
    try {
      const response = await this.request<string>({
        url: this.endpoint,
        method: 'PROPFIND',
        headers: { Depth: '0' },
        data: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:quota-used-bytes/><d:quota-available-bytes/></d:prop></d:propfind>',
        responseType: 'text',
      });
      const usedMatch = response.data.match(
        /<(?:[\w.-]+:)?quota-used-bytes\b[^>]*>\s*(\d+)\s*<\//i,
      );
      const availableMatch = response.data.match(
        /<(?:[\w.-]+:)?quota-available-bytes\b[^>]*>\s*(\d+)\s*<\//i,
      );
      if (!usedMatch || !availableMatch) return undefined;

      const usedBytes = Number(usedMatch[1]);
      const availableBytes = Number(availableMatch[1]);
      const totalBytes = usedBytes + availableBytes;
      if (
        !Number.isSafeInteger(usedBytes) ||
        !Number.isSafeInteger(availableBytes) ||
        !Number.isSafeInteger(totalBytes) ||
        totalBytes <= 0
      ) {
        return undefined;
      }
      return { usedBytes, availableBytes, totalBytes };
    } catch {
      return undefined;
    }
  }

  private async ensureCollection(collectionUrl = this.videosUrl) {
    const root = new URL(this.endpoint);
    const relative = new URL(collectionUrl).pathname.slice(
      root.pathname.length,
    );
    let current = this.endpoint;

    for (const segment of relative.split('/').filter(Boolean)) {
      current = new URL(`${segment}/`, current).toString();
      try {
        await this.request({ url: current, method: 'MKCOL' });
      } catch (error) {
        const status = (error as AxiosError).response?.status;
        if (status !== 405 && status !== 409) throw error;
      }
    }
  }

  async ready() {
    try {
      await this.propfind(this.videosUrl, 0);
      return true;
    } catch {
      return false;
    }
  }

  private classifyError(error: unknown): {
    code: RemoteStorageTestErrorCode;
    message: string;
  } {
    if (error instanceof RemoteStorageError) {
      return { code: 'QUOTA', message: error.message };
    }
    if (!(error instanceof AxiosError)) {
      return { code: 'UNKNOWN', message: redactRemoteStorageError(error) };
    }

    const status = error.response?.status;
    if (status === 401)
      return { code: 'AUTH', message: 'Authentication failed' };
    if (status === 403)
      return { code: 'WRITE', message: 'WebDAV permission denied' };
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return { code: 'TIMEOUT', message: 'The WebDAV request timed out' };
    }
    if (/certificate|tls|ssl/i.test(error.message)) {
      return { code: 'TLS', message: 'TLS certificate validation failed' };
    }
    if (!error.response) {
      return { code: 'NETWORK', message: 'The WebDAV server is unreachable' };
    }
    return { code: 'UNKNOWN', message: redactRemoteStorageError(error) };
  }

  async testConnection(): Promise<RemoteStorageTestResult> {
    const marker = `.warcraft-recorder-test-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}.tmp`;
    const markerUrl = new URL(marker, this.videosUrl).toString();

    try {
      await this.ensureCollection();
      await this.propfind(this.videosUrl, 1);
      await this.request({
        url: markerUrl,
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        data: Buffer.from('Lappen Recorder connection test'),
      });
      await this.request({
        url: markerUrl,
        method: 'GET',
        responseType: 'arraybuffer',
      });

      try {
        await this.request({ url: markerUrl, method: 'DELETE' });
      } catch {
        return {
          ok: false,
          code: 'DELETE',
          message:
            'The test file could not be removed; delete permission is required',
        };
      }

      return {
        ok: true,
        canDelete: true,
        warning: this.insecure
          ? 'The connection uses unencrypted HTTP. HTTPS is strongly recommended.'
          : undefined,
      };
    } catch (error) {
      try {
        await this.request({ url: markerUrl, method: 'DELETE' });
      } catch {
        // Best-effort cleanup; the original structured error is more useful.
      }
      const classified = this.classifyError(error);
      return { ok: false, ...classified };
    }
  }

  private parseEntries(xml: string): DavEntry[] {
    const responses =
      xml.match(/<(?:\w+:)?response\b[\s\S]*?<\/(?:\w+:)?response>/gi) ?? [];
    return responses.flatMap((response) => {
      const href = response.match(
        /<(?:\w+:)?href>([\s\S]*?)<\/(?:\w+:)?href>/i,
      )?.[1];
      if (!href) return [];
      const decodedHref = decodeXml(href);
      const pathname = new URL(decodedHref, this.endpoint).pathname.replace(
        /\/$/,
        '',
      );
      const name = decodeURIComponent(
        pathname.slice(pathname.lastIndexOf('/') + 1),
      );
      const size = Number(
        response.match(
          /<(?:\w+:)?getcontentlength>(\d+)<\/(?:\w+:)?getcontentlength>/i,
        )?.[1] ?? 0,
      );
      const modifiedText = response.match(
        /<(?:\w+:)?getlastmodified>([\s\S]*?)<\/(?:\w+:)?getlastmodified>/i,
      )?.[1];
      return [
        {
          href: new URL(decodedHref, this.endpoint).toString(),
          name,
          size,
          modified: modifiedText ? Date.parse(modifiedText) : 0,
        },
      ];
    });
  }

  private isMetadata(value: unknown): value is Metadata {
    if (!value || typeof value !== 'object') return false;
    const data = value as Partial<Metadata>;
    return (
      typeof data.category === 'string' &&
      typeof data.duration === 'number' &&
      typeof data.result === 'boolean' &&
      typeof data.flavour === 'string' &&
      Array.isArray(data.combatants) &&
      typeof data.overrun === 'number'
    );
  }

  async listVideos(): Promise<RendererVideo[]> {
    await this.ensureCollection();
    const response = await this.propfind(this.videosUrl, 1);
    const entries = this.parseEntries(response.data);
    const entriesByName = new Map(
      entries.map((entry) => [entry.name, entry] as const),
    );
    const metadataEntries = entries.filter((entry) =>
      entry.name.toLowerCase().endsWith('.json'),
    );
    const videos: RendererVideo[] = [];

    for (const entry of metadataEntries) {
      const videoName = sanitizeRemoteFileName(
        entry.name.replace(/\.json$/i, ''),
      );
      const mp4Name = `${videoName}.mp4`;
      const mp4Entry = entriesByName.get(mp4Name);
      if (!mp4Entry) {
        console.warn(
          '[RemoteStorage] Skipping incomplete remote entry',
          videoName,
        );
        continue;
      }

      try {
        const metadataResponse = await this.request<unknown>({
          url: entry.href,
          method: 'GET',
          responseType: 'json',
        });
        if (!this.isMetadata(metadataResponse.data)) {
          console.warn('[RemoteStorage] Skipping invalid metadata', videoName);
          continue;
        }
        const metadata = metadataResponse.data;
        videos.push({
          ...metadata,
          size: mp4Entry.size || metadata.size,
          videoName,
          videoSource: `remote-vod://wcr/${encodeURIComponent(videoName)}`,
          isProtected: Boolean(metadata.protected),
          cloud: true,
          multiPov: [],
          uniqueId: `${videoName}-remote`,
          mtime: entry.modified,
        });
      } catch (error) {
        console.warn(
          '[RemoteStorage] Skipping unreadable metadata',
          videoName,
          redactRemoteStorageError(error),
        );
      }
    }

    return videos;
  }

  async uploadVideo(
    videoPath: string,
    metadata: Metadata,
    rateLimitMbps: number,
    onProgress: ProgressCallback,
  ) {
    await this.ensureCollection();
    const videoName = sanitizeRemoteFileName(path.basename(videoPath, '.mp4'));
    const videoUrl = new URL(`${videoName}.mp4`, this.videosUrl).toString();
    const metadataUrl = new URL(`${videoName}.json`, this.videosUrl).toString();
    const stat = await fs.promises.stat(videoPath);
    const maxRate = rateLimitMbps > 0 ? rateLimitMbps * 1024 ** 2 : undefined;

    if (
      this.provider === 'nextcloud' &&
      this.nextcloudUploadsUrl &&
      stat.size >= NEXTCLOUD_CHUNK_THRESHOLD_BYTES
    ) {
      await this.uploadNextcloudChunks(
        videoPath,
        videoName,
        videoUrl,
        stat,
        maxRate,
        onProgress,
      );
    } else {
      await this.uploadSingleFile(
        videoPath,
        videoUrl,
        stat.size,
        maxRate,
        onProgress,
      );
    }
    onProgress(96);

    const remoteMetadata = {
      ...metadata,
      videoName,
      videoKey: `${videoName}.mp4`,
      start: metadata.start || stat.mtimeMs,
      uniqueHash: metadata.uniqueHash || videoName,
    };
    await this.request({
      url: metadataUrl,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify(remoteMetadata),
    });
    onProgress(98);
    await Promise.all([
      this.propfind(videoUrl, 0),
      this.propfind(metadataUrl, 0),
    ]);
    onProgress(100);
  }

  private async uploadSingleFile(
    videoPath: string,
    videoUrl: string,
    size: number,
    maxRate: number | undefined,
    onProgress: ProgressCallback,
  ) {
    await this.request({
      url: videoUrl,
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4', 'Content-Length': size },
      data: fs.createReadStream(videoPath),
      // Videos can legitimately take hours to upload. A fixed request timeout
      // aborts healthy transfers, especially when a bandwidth limit is set.
      // Short metadata and connection-test requests retain timeoutMs.
      timeout: 0,
      maxRate: maxRate ? [maxRate, Infinity] : undefined,
      onUploadProgress: ({ loaded, total }) =>
        onProgress(
          // Axios reports bytes after they have been written to the request,
          // before the WebDAV server has committed and acknowledged the file.
          // Leave room for that acknowledgement, metadata, and verification.
          Math.min(
            VIDEO_UPLOAD_PROGRESS_PERCENT,
            Math.round(
              (loaded / (total || size)) * VIDEO_UPLOAD_PROGRESS_PERCENT,
            ),
          ),
        ),
    });
  }

  private nextcloudUploadId(
    videoName: string,
    stat: Pick<fs.Stats, 'size' | 'mtimeMs'>,
  ) {
    const identity = crypto
      .createHash('sha256')
      .update(`${videoName}\0${stat.size}\0${stat.mtimeMs}`)
      .digest('hex')
      .slice(0, 24);
    return `warcraft-recorder-${identity}`;
  }

  private nextcloudChunkName(start: number, end: number) {
    return `${String(start).padStart(15, '0')}-${String(end).padStart(
      15,
      '0',
    )}`;
  }

  private isRetryableChunkError(error: unknown) {
    if (!(error instanceof AxiosError)) return false;
    const status = error.response?.status;
    return (
      status === undefined || status === 408 || status === 429 || status >= 500
    );
  }

  private async uploadNextcloudChunk(
    videoPath: string,
    chunkUrl: string,
    start: number,
    end: number,
    totalSize: number,
    maxRate: number | undefined,
    onChunkProgress: (loaded: number) => void,
  ) {
    const chunkSize = end - start + 1;
    for (
      let attempt = 1;
      attempt <= NEXTCLOUD_CHUNK_UPLOAD_ATTEMPTS;
      attempt += 1
    ) {
      try {
        await this.request({
          url: chunkUrl,
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': chunkSize,
            'OC-Total-Length': totalSize,
          },
          data: fs.createReadStream(videoPath, { start, end }),
          timeout: 0,
          maxRate: maxRate ? [maxRate, Infinity] : undefined,
          onUploadProgress: ({ loaded }) =>
            onChunkProgress(Math.min(loaded, chunkSize)),
        });
        return;
      } catch (error) {
        if (
          attempt === NEXTCLOUD_CHUNK_UPLOAD_ATTEMPTS ||
          !this.isRetryableChunkError(error)
        ) {
          throw error;
        }
      }
    }
  }

  private async uploadNextcloudChunks(
    videoPath: string,
    videoName: string,
    videoUrl: string,
    stat: Pick<fs.Stats, 'size' | 'mtimeMs'>,
    maxRate: number | undefined,
    onProgress: ProgressCallback,
  ) {
    if (!this.nextcloudUploadsUrl) {
      throw new Error('Nextcloud upload endpoint is unavailable');
    }

    const uploadId = this.nextcloudUploadId(videoName, stat);
    const uploadFolderUrl = new URL(
      `${uploadId}/`,
      this.nextcloudUploadsUrl,
    ).toString();
    try {
      await this.request({ url: uploadFolderUrl, method: 'MKCOL' });
    } catch (error) {
      if ((error as AxiosError).response?.status !== 405) throw error;
    }

    const existingResponse = await this.propfind(uploadFolderUrl, 1);
    const existingChunks = new Map(
      this.parseEntries(existingResponse.data).map((entry) => [
        entry.name,
        entry.size,
      ]),
    );
    let committedBytes = 0;
    let reportedBytes = 0;
    const reportBytes = (bytes: number) => {
      reportedBytes = Math.max(reportedBytes, Math.min(bytes, stat.size));
      onProgress(
        Math.round((reportedBytes / stat.size) * VIDEO_UPLOAD_PROGRESS_PERCENT),
      );
    };

    for (
      let start = 0;
      start < stat.size;
      start += NEXTCLOUD_CHUNK_SIZE_BYTES
    ) {
      const end = Math.min(
        start + NEXTCLOUD_CHUNK_SIZE_BYTES - 1,
        stat.size - 1,
      );
      const chunkSize = end - start + 1;
      const chunkName = this.nextcloudChunkName(start, end);
      if (existingChunks.get(chunkName) === chunkSize) {
        committedBytes += chunkSize;
        reportBytes(committedBytes);
        continue;
      }

      await this.uploadNextcloudChunk(
        videoPath,
        new URL(chunkName, uploadFolderUrl).toString(),
        start,
        end,
        stat.size,
        maxRate,
        (loaded) => reportBytes(committedBytes + loaded),
      );
      committedBytes += chunkSize;
      reportBytes(committedBytes);
    }

    await this.request({
      url: new URL('.file', uploadFolderUrl).toString(),
      method: 'MOVE',
      headers: {
        Destination: videoUrl,
        'OC-Total-Length': stat.size,
      },
      // Nextcloud assembles all chunks during MOVE, which can take longer than
      // an ordinary metadata request for multi-gigabyte recordings.
      timeout: 0,
    });
  }

  async downloadVideo(
    video: RendererVideo,
    destinationPath: string,
    onProgress: ProgressCallback,
  ) {
    const videoName = sanitizeRemoteFileName(video.videoName);
    const sourceUrl = new URL(`${videoName}.mp4`, this.videosUrl).toString();
    const partialPath = `${destinationPath}.part`;
    const response = await this.request<NodeJS.ReadableStream>({
      url: sourceUrl,
      method: 'GET',
      responseType: 'stream',
      onDownloadProgress: ({ loaded, total }) =>
        onProgress(Math.round((loaded / (total || loaded)) * 100)),
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const output = fs.createWriteStream(partialPath, { flags: 'w' });
        response.data.pipe(output);
        response.data.on('error', reject);
        output.on('error', reject);
        output.on('finish', resolve);
      });
      await fs.promises.rename(partialPath, destinationPath);
      onProgress(100);
    } catch (error) {
      await fs.promises.unlink(partialPath).catch(() => undefined);
      throw error;
    }
  }

  async streamVideo(
    rawVideoName: string,
    range?: string,
  ): Promise<RemoteVideoStream> {
    const videoName = sanitizeRemoteFileName(rawVideoName);
    const response = await this.request<NodeJS.ReadableStream>({
      url: new URL(`${videoName}.mp4`, this.videosUrl).toString(),
      method: 'GET',
      headers: range ? { Range: range } : undefined,
      responseType: 'stream',
    });
    const contentLength = response.headers['content-length'];
    const contentRange = response.headers['content-range'];

    return {
      data: response.data,
      status: response.status === 206 ? 206 : 200,
      contentLength:
        contentLength === undefined ? undefined : String(contentLength),
      contentRange:
        contentRange === undefined ? undefined : String(contentRange),
    };
  }

  async deleteVideos(videoNames: string[]) {
    const failures: string[] = [];
    for (const rawName of videoNames) {
      const videoName = sanitizeRemoteFileName(rawName);
      for (const extension of ['.mp4', '.json']) {
        try {
          await this.request({
            url: new URL(`${videoName}${extension}`, this.videosUrl).toString(),
            method: 'DELETE',
          });
        } catch (error) {
          if ((error as AxiosError).response?.status !== 404)
            failures.push(extension);
        }
      }
      try {
        await this.request({
          url: this.chatUrl(videoName),
          method: 'DELETE',
        });
      } catch (error) {
        if ((error as AxiosError).response?.status !== 404)
          failures.push('.chat.json');
      }
    }
    if (failures.length)
      throw new Error('Remote video deletion was only partially successful');
  }

  private chatUrl(rawCorrelator: string) {
    const correlator = sanitizeRemoteFileName(rawCorrelator);
    if (correlator !== rawCorrelator)
      throw new Error('Invalid chat correlator');
    return new URL(`${correlator}.json`, this.chatsUrl).toString();
  }

  private async readChatDocument(correlator: string): Promise<ChatDocument> {
    if (!this.chatsCollectionReady) {
      await this.ensureCollection(this.chatsUrl);
      this.chatsCollectionReady = true;
    }
    try {
      const response = await this.request<unknown>({
        url: this.chatUrl(correlator),
        method: 'GET',
        responseType: 'json',
      });
      const parsed = ChatMessageWithId.array().safeParse(response.data);
      if (!parsed.success) throw new Error('Invalid remote chat data');
      const etag = response.headers?.etag;
      return {
        messages: parsed.data.sort((a, b) => a.timestamp - b.timestamp),
        etag: typeof etag === 'string' ? etag : undefined,
        exists: true,
      };
    } catch (error) {
      if ((error as AxiosError).response?.status === 404) {
        return { messages: [], exists: false };
      }
      throw error;
    }
  }

  async getChatMessages(correlator: string) {
    return (await this.readChatDocument(correlator)).messages;
  }

  private serializeChatMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.chatMutationQueue.then(operation, operation);
    this.chatMutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  addChatMessage(
    correlator: string,
    userName: string,
    message: string,
  ): Promise<TChatMessageWithId> {
    return this.serializeChatMutation(async () => {
      const chatMessage = ChatMessageWithId.parse({
        id: Math.floor(Math.random() * Number.MAX_SAFE_INTEGER),
        correlator,
        userName,
        message,
        timestamp: Date.now(),
      });
      await this.mutateChatDocument(correlator, (messages) => [
        ...messages,
        chatMessage,
      ]);
      return chatMessage;
    });
  }

  deleteChatMessage(correlator: string, id: number): Promise<void> {
    return this.serializeChatMutation(async () => {
      await this.mutateChatDocument(correlator, (messages) =>
        messages.filter((entry) => entry.id !== id),
      );
    });
  }

  private async mutateChatDocument(
    correlator: string,
    mutate: (messages: TChatMessageWithId[]) => TChatMessageWithId[],
  ) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const document = await this.readChatDocument(correlator);
      const messages = mutate(document.messages);
      if (
        document.exists &&
        messages.length === document.messages.length &&
        messages.every((entry, index) => entry === document.messages[index])
      ) {
        return;
      }

      try {
        await this.request({
          url: this.chatUrl(correlator),
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(document.etag
              ? { 'If-Match': document.etag }
              : document.exists
                ? {}
                : { 'If-None-Match': '*' }),
          },
          data: JSON.stringify(messages),
        });
        return;
      } catch (error) {
        const status = (error as AxiosError).response?.status;
        if (status === 409) this.chatsCollectionReady = false;
        if ((status !== 409 && status !== 412) || attempt === 2) throw error;
      }
    }
  }

  private nextcloudFilePath(videoName: string) {
    const decodedBasePath = this.basePath
      .split('/')
      .map((segment) => decodeURIComponent(segment))
      .join('/');
    return `/${decodedBasePath}/videos/${videoName}.mp4`;
  }

  private getShareUrl(response: NextcloudOcsResponse<NextcloudShare>) {
    const url = response.ocs?.data?.url;
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      throw new Error('Nextcloud did not return a valid public share URL');
    }
    return url;
  }

  async createShareLink(rawVideoName: string): Promise<string> {
    if (this.provider !== 'nextcloud' || !this.nextcloudSharesUrl) {
      throw new Error(
        'The active WebDAV provider does not support share links',
      );
    }

    const videoName = sanitizeRemoteFileName(rawVideoName);
    const remotePath = this.nextcloudFilePath(videoName);
    const headers = {
      Accept: 'application/json',
      'OCS-APIRequest': 'true',
    };

    const existing = await this.request<NextcloudShareListResponse>({
      url: this.nextcloudSharesUrl,
      method: 'GET',
      headers,
      params: { path: remotePath, reshares: true },
    });
    const publicShare = existing.data.ocs?.data?.find(
      (share) => share.share_type === 3 && typeof share.url === 'string',
    );
    if (publicShare?.url) return publicShare.url;

    const created = await this.request<NextcloudOcsResponse<NextcloudShare>>({
      url: this.nextcloudSharesUrl,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: new URLSearchParams({
        path: remotePath,
        shareType: '3',
        permissions: '1',
      }).toString(),
    });
    return this.getShareUrl(created.data);
  }
}
