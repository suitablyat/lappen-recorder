import type { Metadata, RendererVideo } from '../../main/types';
import type { TChatMessageWithId } from '../../types/api';
import {
  disabledCapabilities,
  ProgressCallback,
  RemoteStorageProvider,
  RemoteStorageTestResult,
  RemoteVideoStream,
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

  async streamVideo(
    videoName: string,
    range?: string,
  ): Promise<RemoteVideoStream> {
    void videoName;
    void range;
    throw new Error('Remote storage is disabled');
  }

  async deleteVideos(videoNames: string[]): Promise<void> {
    void videoNames;
    throw new Error('Remote storage is disabled');
  }

  async createShareLink(videoName: string): Promise<string> {
    void videoName;
    throw new Error('Remote storage is disabled');
  }

  async getChatMessages(correlator: string): Promise<TChatMessageWithId[]> {
    void correlator;
    throw new Error('Remote storage is disabled');
  }

  async addChatMessage(
    correlator: string,
    userName: string,
    message: string,
  ): Promise<TChatMessageWithId> {
    void correlator;
    void userName;
    void message;
    throw new Error('Remote storage is disabled');
  }

  async deleteChatMessage(correlator: string, id: number): Promise<void> {
    void correlator;
    void id;
    throw new Error('Remote storage is disabled');
  }
}
