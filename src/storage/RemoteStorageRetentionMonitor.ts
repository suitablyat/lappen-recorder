import type { RendererVideo } from '../main/types';
import type { RemoteStorageCapabilities } from './remote/RemoteStorageProvider';
import { redactRemoteStorageError } from './remote/remoteStorageUtils';

const RETENTION_TARGET_RATIO = 0.95;

export type RemoteStorageRetentionClient = {
  readonly capabilities: RemoteStorageCapabilities;
  ready(): Promise<boolean>;
  listVideos(): Promise<RendererVideo[]>;
  deleteVideos(videoNames: string[]): Promise<void>;
};

export type RemoteStorageRetentionOptions = {
  enabled: boolean;
  limitBytes: number;
  uploadsActive: boolean;
  reservedBytes?: number;
};

export const selectRemoteVideosForRetention = (
  videos: RendererVideo[],
  limitBytes: number,
  reservedBytes = 0,
): RendererVideo[] => {
  if (
    !Number.isSafeInteger(limitBytes) ||
    limitBytes <= 0 ||
    !Number.isSafeInteger(reservedBytes) ||
    reservedBytes < 0
  ) {
    return [];
  }

  const sizedVideos = videos.filter(
    (video) =>
      Number.isSafeInteger(video.size) &&
      (video.size ?? 0) > 0 &&
      typeof video.videoName === 'string' &&
      video.videoName.length > 0,
  );
  const usage =
    sizedVideos.reduce((total, video) => total + video.size!, 0) +
    reservedBytes;
  if (!Number.isSafeInteger(usage)) return [];
  if (usage <= limitBytes) return [];

  const bytesToFree = usage - limitBytes * RETENTION_TARGET_RATIO;
  const candidates = sizedVideos
    .filter(
      (video) =>
        !video.isProtected && Number.isFinite(video.mtime) && video.mtime > 0,
    )
    .sort((left, right) => left.mtime - right.mtime);
  const selected: RendererVideo[] = [];
  let selectedBytes = 0;

  for (const video of candidates) {
    selected.push(video);
    selectedBytes += video.size!;
    if (selectedBytes >= bytesToFree) break;
  }

  return selected;
};

export default class RemoteStorageRetentionMonitor {
  constructor(private readonly client: RemoteStorageRetentionClient) {}

  async run(options: RemoteStorageRetentionOptions): Promise<string[]> {
    if (
      !options.enabled ||
      options.uploadsActive ||
      options.limitBytes <= 0 ||
      !this.client.capabilities.list ||
      !this.client.capabilities.delete
    ) {
      return [];
    }

    try {
      if (!(await this.client.ready())) return [];
      const videos = await this.client.listVideos();
      const selected = selectRemoteVideosForRetention(
        videos,
        options.limitBytes,
        options.reservedBytes,
      );
      if (selected.length === 0) return [];

      const names = selected.map((video) => video.videoName);
      console.info(
        `[RemoteStorageRetention] Deleting ${names.length} old recording(s)`,
      );
      await this.client.deleteVideos(names);
      return names;
    } catch (error) {
      console.warn(
        '[RemoteStorageRetention] Cleanup failed',
        redactRemoteStorageError(error),
      );
      return [];
    }
  }
}
