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
  it has no account, guild, proprietary API, or WebSocket dependency. Documents
  are limited to 1 MiB and 1,000 validated messages, and conditional ETag
  writes prevent concurrent clients from silently overwriting one another.
- WebDAV upload progress reserves the final percentage range for server
  acknowledgement, JSON metadata upload, and remote verification. Request-byte
  progress alone is not treated as a completed remote write.
- Nextcloud MP4 files of 256 MiB or larger use its provider-specific chunked
  upload v2 protocol with 64 MiB chunks. Chunk names encode inclusive byte
  ranges, each transiently failed chunk is attempted at most three times, and
  `OC-Total-Length` is sent for quota validation. A deterministic temporary
  upload ID based on the normalized video name, size, and modification time
  allows a later retry or application restart to validate and skip chunks that
  Nextcloud still retains. The MP4 becomes visible only after Nextcloud
  assembles it with `MOVE`; JSON metadata is uploaded afterward.
- Generic WebDAV continues to use one standards-compatible `PUT`, because
  resumable chunk assembly is not part of the generic WebDAV protocol.
- Storage quota is an optional provider capability. WebDAV providers query the
  authenticated account root for the standard `DAV:quota-used-bytes` and
  `DAV:quota-available-bytes` properties. Servers that omit those properties
  remain fully usable, while Nextcloud and other supporting servers expose the
  values through validated IPC as a Settings usage bar.
- HTTP 507 responses are converted inside the provider into a sanitized
  `INSUFFICIENT_STORAGE` error. The upload queue keeps the local recording,
  stops that upload without an automatic retry loop, and refreshes remote
  status so Settings can explain the failure.
- Optional remote retention provides automatic cleanup for recordings
  managed by Warcraft Recorder. It sums only complete, validated MP4/JSON
  pairs returned by the provider, never account-wide quota usage or unrelated
  server files. When managed recordings exceed the user-defined ceiling, the
  oldest unprotected recordings are removed until usage is at or below 95% of
  that ceiling.
- Retention runs while the upload queue is empty and as a reservation step
  immediately before an upload request starts. The reservation includes the
  incoming MP4 size, preventing a server-side quota rejection before cleanup
  gets a chance to run. It never deletes during network transfer and requires
  explicit provider listing and deletion capabilities. Missing sizes,
  protected recordings, provider errors, and incomplete entries are never
  guessed at or deleted. Local recordings remain the source of truth and are
  unaffected.
- Nextcloud exposes the provider `protection` capability. Locking selected
  remote rows updates the `protected` field in each recording's JSON metadata
  through conditional ETag writes; unlocking clears that field. Conflicting
  metadata changes are re-read and attempted at most three times. If Nextcloud
  persistently rejects its own returned ETag, the final freshly-read write uses
  the standard `If-Match: *` existing-resource precondition. Retention consumes
  the persisted value returned by normal remote listing and therefore never
  ages out locked rows. Generic WebDAV does not advertise this capability.
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
