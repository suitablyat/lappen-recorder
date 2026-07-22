import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import fs from 'fs';
import path from 'path';
import type { Metadata, RendererVideo } from '../../main/types';
import {
  ProgressCallback,
  RemoteStorageProvider,
  RemoteStorageTestErrorCode,
  RemoteStorageTestResult,
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

type NextcloudShare = { share_type?: number; url?: string };
type NextcloudOcsResponse<T> = {
  ocs?: {
    meta?: { status?: string; statuscode?: number; message?: string };
    data?: T;
  };
};
type NextcloudShareListResponse = NextcloudOcsResponse<NextcloudShare[]>;

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
  };

  private readonly endpoint: string;
  private readonly videosUrl: string;
  private readonly insecure: boolean;
  private readonly username: string;
  private readonly password: string;
  private readonly timeoutMs: number;
  private readonly provider: 'webdav' | 'nextcloud';
  private readonly basePath: string;
  private readonly nextcloudSharesUrl?: string;

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
    this.capabilities.shareLinks = config.provider === 'nextcloud';

    if (config.provider === 'nextcloud') {
      const endpointUrl = new URL(this.endpoint);
      const remotePhpIndex = endpointUrl.pathname.indexOf('/remote.php/');
      const installationPath =
        remotePhpIndex >= 0
          ? endpointUrl.pathname.slice(0, remotePhpIndex)
          : endpointUrl.pathname.replace(/\/$/, '');
      this.nextcloudSharesUrl = new URL(
        `${installationPath}/ocs/v2.php/apps/files_sharing/api/v1/shares`,
        endpointUrl.origin,
      ).toString();
    }
  }

  private request<T = unknown>(config: AxiosRequestConfig) {
    return axios.request<T>({
      ...config,
      auth: { username: this.username, password: this.password },
      timeout: config.timeout ?? this.timeoutMs,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
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

  private async ensureCollection() {
    const root = new URL(this.endpoint);
    const relative = new URL(this.videosUrl).pathname.slice(
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
        data: Buffer.from('Warcraft Recorder connection test'),
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
    const names = new Set(entries.map((entry) => entry.name));
    const metadataEntries = entries.filter((entry) =>
      entry.name.toLowerCase().endsWith('.json'),
    );
    const videos: RendererVideo[] = [];

    for (const entry of metadataEntries) {
      const videoName = sanitizeRemoteFileName(
        entry.name.replace(/\.json$/i, ''),
      );
      const mp4Name = `${videoName}.mp4`;
      if (!names.has(mp4Name)) {
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
          videoName,
          videoSource: new URL(mp4Name, this.videosUrl).toString(),
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

    await this.request({
      url: videoUrl,
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4', 'Content-Length': stat.size },
      data: fs.createReadStream(videoPath),
      // Videos can legitimately take hours to upload. A fixed request timeout
      // aborts healthy transfers, especially when a bandwidth limit is set.
      // Short metadata and connection-test requests retain timeoutMs.
      timeout: 0,
      maxRate: maxRate ? [maxRate, Infinity] : undefined,
      onUploadProgress: ({ loaded, total }) =>
        onProgress(
          Math.min(99, Math.round((loaded / (total || stat.size)) * 100)),
        ),
    });

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
    await Promise.all([
      this.propfind(videoUrl, 0),
      this.propfind(metadataUrl, 0),
    ]);
    onProgress(100);
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
    }
    if (failures.length)
      throw new Error('Remote video deletion was only partially successful');
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
