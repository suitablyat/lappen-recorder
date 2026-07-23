# Modification record

This file is the prominent modification notice for Lappen Recorder, a modified distribution of Warcraft Recorder under `GPL-2.0-only`. Exact file-level changes, authorship, and dates are preserved in Git. Run `git diff 5d17d0281ccd8bf7a1aa74a556e9ca5715783ad4..HEAD` to inspect the fork changes.

## 2026-07-22 to 2026-07-23

- Replaced the proprietary account-backed cloud service with optional provider-based remote storage for Nextcloud and generic WebDAV.
- Added remote upload, download, listing, deletion, playback, authentication, configuration migration, and tests while keeping local storage authoritative.
- Fixed remote video seek, pause, and authenticated playback behavior.
- Added Nextcloud public share links and support for long-running WebDAV uploads.
- Changed product, package, installer, update-feed, repository identity, and application artwork to Lappen Recorder so fork builds do not impersonate or update from upstream.
- Added a non-destructive, one-time migration of compatible configuration files into the fork's separate application-data directory.
- Removed upstream donation and community links from the fork UI and documentation.
- Added GPL compliance automation, third-party notices, exact source manifests, release-source links, source-retention policy, contribution licensing terms, and fork/trademark notices.

## Release records

Each release's `RELEASE_MANIFEST.json` records the exact Lappen Recorder, `noobs`, OBS, and FFmpeg source commits and SHA-256 hashes. Corresponding-source archives must remain available as long as that release's installer or updater files are available.
