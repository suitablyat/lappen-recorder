# Modification record

This file is the prominent modification notice for Lappen Recorder, a modified distribution of Warcraft Recorder under `GPL-2.0-only`. Exact file-level changes, authorship, and dates are preserved in Git. Run `git diff 5d17d0281ccd8bf7a1aa74a556e9ca5715783ad4..HEAD` to inspect the fork changes.

## 2026-07-22 to 2026-07-23

- Replaced the proprietary account-backed cloud service with optional provider-based remote storage for Nextcloud and generic WebDAV.
- Added remote upload, download, listing, deletion, playback, authentication, configuration migration, and tests while keeping local storage authoritative.
- Fixed remote video seek, pause, and authenticated playback behavior.
- Added Nextcloud public share links and support for long-running WebDAV uploads.
- Added provider-hosted per-video chat without accounts, centralized APIs, or
  WebSockets, with bounded documents and conditional writes for concurrency.
- Hardened provider-specific share and chat IPC with strict normalized names,
  bounded responses, capability checks, and secret-redacted errors.
- Changed product, package, installer, update-feed, repository identity, and application artwork to Lappen Recorder so fork builds do not impersonate or update from upstream.
- Changed the Windows setup from one-click installation to an assisted wizard that allows users to choose the installation folder.
- Added a non-destructive, one-time migration of compatible configuration files into the fork's separate application-data directory.
- Removed upstream donation and community links from the fork UI and documentation.
- Added GPL compliance automation, third-party notices, exact source manifests, release-source links, source-retention policy, contribution licensing terms, and fork/trademark notices.
- Prepared a SignPath Foundation release-signing policy and trusted GitHub
  Actions design with manual approval, signature verification, and signed-file
  update-metadata regeneration. Production signing remains disabled until the
  project is accepted and provisioned by SignPath Foundation.

## 2026-09-09

- Merged aza547/wow-recorder main through 0566da15, including encounter, recording, combat-log diagnostics, and React Table v9 dialog updates.
- Retained the fork identity, release version, optional remote storage, encrypted credentials, and provider-hosted chat.
- Adapted the new lock/tag controls to provider capabilities and added renderer regression tests.
- Removed an upstream duplicate combat-log IPC listener that disabled manual hotkeys, and aligned instant replay with the renamed player prop.
- Replaced the upstream local noobs tarball reference with its verified npm URL, pinned its published source revision, and regenerated third-party notices. The packaged OBS version still identifies source 71eaeafa4; its binary checksum was refreshed for the new noobs package.

## 2026-09-28

- Merged upstream through 09d36b90, retaining fork CI, identity, optional remote storage, and profile migration.
- Integrated indexed application log rotation and 500-file retention using the LappenRecorder filename prefix.
- Integrated settings persistence fixes and React hook cleanup; the updated lint plugin exposes 16 errors and 9 warnings requiring follow-up.
- Prepared unsigned prerelease 8.0.0-rc.6 while SignPath enrollment remains pending.

## 2026-09-28 — RC.7

- Restored the previously validated React hooks ESLint 5.2 dependency after the upstream 7.1 upgrade caused CI failures. Application changes from RC.6 are retained.
- Prepared unsigned prerelease 8.0.0-rc.7 with passing lint, tests, build, and license-compliance checks for the CI correction.

## Release records

Each release's `RELEASE_MANIFEST.json` records the exact Lappen Recorder, `noobs`, OBS, and FFmpeg source commits and SHA-256 hashes. Corresponding-source archives must remain available as long as that release's installer or updater files are available.
