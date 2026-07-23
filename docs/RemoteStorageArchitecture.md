# Remote storage architecture

## Current architecture

- `RemoteStorageService` is the main-process boundary used by upload/download
  queues and IPC. It selects a `RemoteStorageProvider` through the provider
  factory and falls back to `DisabledStorageProvider` when remote storage is
  disabled or invalid.
- `WebDavStorageProvider` owns Nextcloud and generic WebDAV requests, including
  authentication, collection setup, listing, upload, download, deletion, and
  optional Nextcloud share links.
- Local recordings remain owned by `DiskClient`; `VideoProcessQueue` writes and
  processes local files before asking `RemoteStorageService` to transfer them.
- Remote listings are merged from validated JSON/MP4 pairs. A remote
  `RendererVideo.videoSource` is an opaque `remote-vod://` reference, while a
  local source is a filesystem path.
- Providers with the `chat` capability store validated per-video chat documents
  under `WarcraftRecorder/chats/<video-name>.json`. Chat is polled while open;
  it has no account, guild, proprietary API, or WebSocket dependency.
- The renderer wraps local sources in the `vod://wcr/` protocol. The main
  process protocol handler serves those files with byte-range support.

Some compatibility names remain in renderer state, localization, upload-filter
configuration, and IPC (`cloud*`, `CloudStatus`, and `videoButtonCloud`). They
no longer represent an account, guild, WCR API, WebSocket, or R2 dependency.

## Playback coupling

Remote playback depends on the renderer distinguishing provider-independent
`remote-vod://` references from local paths. The main-process remote protocol
handler validates the video name and range, then asks the active provider for
an authenticated byte stream. Legacy HTTP(S) sources remain recognized during
migration so they are never passed to the local-file `fs.stat` handler.

## Target boundaries

- Business logic depends only on `RemoteStorageService` and
  `RemoteStorageProvider`, never on WebDAV details.
- Provider-specific URLs, authentication, capabilities, and requests remain in
  provider implementations.
- Local storage remains the source of truth and remote failures never remove or
  block local recordings.
- New providers implement the provider contract and are selected by the factory
  without changing the processing queue.

## Intentionally unsupported proprietary features

Guild permissions, centralized chat history, push updates, and cross-provider
share links are not recreated. Remote chat access follows the configured
provider's read/write/delete permissions, and the WebDAV username is used as the
display name.
