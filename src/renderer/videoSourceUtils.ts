/**
 * Remote WebDAV playback supports HTTPS and explicitly configured HTTP URLs.
 * All other sources are local files served by the main-process VOD protocol.
 */
export const isRemoteVideoSource = (source: string) =>
  source.startsWith('remote-vod://') ||
  source.startsWith('https://') ||
  source.startsWith('http://');

export const toPlayableVideoSource = (source: string) => {
  if (source.startsWith('remote-vod://')) return source;

  if (isRemoteVideoSource(source)) {
    try {
      const pathname = new URL(source).pathname;
      const fileName = decodeURIComponent(
        pathname.slice(pathname.lastIndexOf('/') + 1),
      );
      if (fileName.toLowerCase().endsWith('.mp4')) {
        const videoName = fileName.slice(0, -'.mp4'.length);
        return `remote-vod://wcr/${encodeURIComponent(videoName)}`;
      }
    } catch {
      // Invalid URL-like values fall through to the local protocol validation.
    }
  }

  return `vod://wcr/${source}`;
};
