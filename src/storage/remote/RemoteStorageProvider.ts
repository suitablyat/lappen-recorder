import type { Metadata, RendererVideo } from '../../main/types';
import type { TChatMessageWithId } from '../../types/api';

export type RemoteStorageCapabilities = {
  list: boolean;
  upload: boolean;
  download: boolean;
  delete: boolean;
  shareLinks: boolean;
  tags: boolean;
  protection: boolean;
  chat: boolean;
  quota: boolean;
};

export type RemoteStorageQuota = {
  usedBytes: number;
  availableBytes: number;
  totalBytes: number;
};

export type RemoteStorageErrorCode = 'INSUFFICIENT_STORAGE';

export class RemoteStorageError extends Error {
  constructor(
    readonly code: RemoteStorageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RemoteStorageError';
  }
}

export type RemoteStorageTestErrorCode =
  | 'URL'
  | 'NETWORK'
  | 'TLS'
  | 'AUTH'
  | 'BASE_PATH'
  | 'READ'
  | 'WRITE'
  | 'DELETE'
  | 'QUOTA'
  | 'TIMEOUT'
  | 'UNKNOWN';

export type RemoteStorageTestResult =
  | { ok: true; canDelete: boolean; warning?: string }
  | { ok: false; code: RemoteStorageTestErrorCode; message: string };

export type ProgressCallback = (progress: number) => void;

export type RemoteVideoStream = {
  data: NodeJS.ReadableStream;
  status: 200 | 206;
  contentLength?: string;
  contentRange?: string;
};

export interface RemoteStorageProvider {
  readonly id: string;
  readonly capabilities: RemoteStorageCapabilities;
  ready(): Promise<boolean>;
  testConnection(): Promise<RemoteStorageTestResult>;
  getQuota(): Promise<RemoteStorageQuota | undefined>;
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
  streamVideo(videoName: string, range?: string): Promise<RemoteVideoStream>;
  deleteVideos(videoNames: string[]): Promise<void>;
  protectVideos(videoNames: string[], protect: boolean): Promise<void>;
  createShareLink(videoName: string): Promise<string>;
  getChatMessages(correlator: string): Promise<TChatMessageWithId[]>;
  addChatMessage(
    correlator: string,
    userName: string,
    message: string,
  ): Promise<TChatMessageWithId>;
  deleteChatMessage(correlator: string, id: number): Promise<void>;
}

export const disabledCapabilities: RemoteStorageCapabilities = {
  list: false,
  upload: false,
  download: false,
  delete: false,
  shareLinks: false,
  tags: false,
  protection: false,
  chat: false,
  quota: false,
};
