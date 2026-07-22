import type { Metadata, RendererVideo } from '../../main/types';

export type RemoteStorageCapabilities = {
  list: boolean;
  upload: boolean;
  download: boolean;
  delete: boolean;
  shareLinks: boolean;
  tags: boolean;
  protection: boolean;
};

export type RemoteStorageTestErrorCode =
  | 'URL'
  | 'NETWORK'
  | 'TLS'
  | 'AUTH'
  | 'BASE_PATH'
  | 'READ'
  | 'WRITE'
  | 'DELETE'
  | 'TIMEOUT'
  | 'UNKNOWN';

export type RemoteStorageTestResult =
  | { ok: true; canDelete: boolean; warning?: string }
  | { ok: false; code: RemoteStorageTestErrorCode; message: string };

export type ProgressCallback = (progress: number) => void;

export interface RemoteStorageProvider {
  readonly id: string;
  readonly capabilities: RemoteStorageCapabilities;
  ready(): Promise<boolean>;
  testConnection(): Promise<RemoteStorageTestResult>;
  listVideos(): Promise<RendererVideo[]>;
  uploadVideo(
    videoPath: string,
    metadata: Metadata,
    rateLimitMbps: number,
    onProgress: ProgressCallback,
  ): Promise<void>;
  downloadVideo(
    video: RendererVideo,
    destinationPath: string,
    onProgress: ProgressCallback,
  ): Promise<void>;
  deleteVideos(videoNames: string[]): Promise<void>;
}

export const disabledCapabilities: RemoteStorageCapabilities = {
  list: false,
  upload: false,
  download: false,
  delete: false,
  shareLinks: false,
  tags: false,
  protection: false,
};
