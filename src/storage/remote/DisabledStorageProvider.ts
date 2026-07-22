import type { Metadata, RendererVideo } from '../../main/types';
import {
  disabledCapabilities,
  ProgressCallback,
  RemoteStorageProvider,
  RemoteStorageTestResult,
} from './RemoteStorageProvider';

export default class DisabledStorageProvider implements RemoteStorageProvider {
  readonly id = 'disabled';
  readonly capabilities = disabledCapabilities;

  async ready() {
    return false;
  }

  async testConnection(): Promise<RemoteStorageTestResult> {
    return {
      ok: false,
      code: 'UNKNOWN',
      message: 'Remote storage is disabled',
    };
  }

  async listVideos(): Promise<RendererVideo[]> {
    return [];
  }

  async uploadVideo(
    videoPath: string,
    metadata: Metadata,
    rateLimitMbps: number,
    onProgress: ProgressCallback,
  ): Promise<void> {
    void videoPath;
    void metadata;
    void rateLimitMbps;
    void onProgress;
    throw new Error('Remote storage is disabled');
  }

  async downloadVideo(
    video: RendererVideo,
    destinationPath: string,
    onProgress: ProgressCallback,
  ): Promise<void> {
    void video;
    void destinationPath;
    void onProgress;
    throw new Error('Remote storage is disabled');
  }

  async deleteVideos(videoNames: string[]): Promise<void> {
    void videoNames;
    throw new Error('Remote storage is disabled');
  }
}
