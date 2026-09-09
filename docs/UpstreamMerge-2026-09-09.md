# Upstream merge: 2026-09-09

Merged 31 upstream commits from aza547/wow-recorder main through 0566da15 into local main (previous head 674e729a).

## Architecture and merge decisions

The existing architecture uses DiskClient for local files and RemoteStorageService plus a provider factory for optional Nextcloud/WebDAV storage. CloudClient has been removed; compatibility cloud names refer to provider-independent state. Local recordings remain authoritative. See RemoteStorageArchitecture.md for the detailed boundaries.

The target architecture is unchanged. This merge imports recording and encounter fixes, combat-log diagnostics, React Table v9, and per-video lock/tag/delete dialogs. The new controls explicitly check provider protection/tag capabilities. Provider-hosted chat remains keyed by remote video names; the upstream account-name prompt and centralized correlator requirements are excluded.

No configuration or credential migration is added. Existing migration, encrypted credentials, offline defaults, provider networking in main, fork branding, GPL licensing, update feed, and 8.0.0-rc.4 version are preserved. Proprietary accounts, guild permissions, centralized metadata/chat and WCR service dependencies remain unsupported. Existing provider-specific sharing remains unchanged.

Additional integration fixes remove the duplicate upstream combat-log refresh listener that disabled manual hotkeys, update the instant-replay player prop, and exclude packaged build output from Jest discovery.

## Dependency and source verification

React Table advances to 9.0.0 and noobs to 0.0.205. Upstream's machine-local noobs tarball URL is replaced with the npm registry URL; published integrity matches. The npm gitHead pins source 04e7def2ef053a0af4079e09482f0c688a9f16b2. The packaged OBS DLL still embeds 27.2.0-4590-g71eaeafa4, matching the retained source revision; its updated SHA-256 is recorded. Third-party notices are regenerated.

## Validation

- npm test: PASS, 15 suites and 75 tests, including 7 new renderer capability cases. Network access is mocked in remote-storage tests.
- npm run lint: PASS, 0 errors and 9 React hook warnings.
- npm run build: PASS, final main and renderer production builds both exited 0.
- npm run compliance:check: PASS.
- git diff --check: PASS.
- Additional TypeScript check (node node_modules/typescript/bin/tsc --noEmit): FAIL. Diagnostics include dependency declaration/module-resolution errors, type-only re-exports, legacy metadata typing, and native API typing. The discovered instant-replay prop mismatch is fixed. This check is separate from the configured production build, which transpiles without full type checking.

## Remaining risks and follow-up

No interactive WoW recording, real-server WebDAV/Nextcloud test, signed installer, or published release was performed. Smoke-test recording, instant replay, table selection/dialogs, and remote transfers before releasing. Resolve the full TypeScript diagnostics and existing hook warnings as follow-up work. Native dependencies were installed with lifecycle scripts disabled; normal packaging must execute the project's native dependency setup. Nothing is pushed by this merge task.

## Modified files

- .prettierignore
- CHANGELOG.md
- MODIFICATIONS.md
- THIRD_PARTY_NOTICES.md
- docs/UpstreamMerge-2026-09-09.md
- package-lock.json
- package.json
- release/app/package-lock.json
- release/app/package.json
- release/source-components.json
- src/__tests__/renderer/RemoteVideoControls.test.tsx
- src/activitys/RaidEncounter.ts
- src/activitys/encounters/Beloren.ts
- src/activitys/encounters/CoiledAltar.ts
- src/activitys/encounters/CrownOfTheCosmos.ts
- src/localisation/chineseSimplified.ts
- src/localisation/english.ts
- src/localisation/german.ts
- src/localisation/korean.ts
- src/localisation/phrases.ts
- src/main/Manager.ts
- src/main/constants.ts
- src/main/main.ts
- src/main/preload.ts
- src/main/types.ts
- src/main/util.ts
- src/parsing/LogHandler.ts
- src/parsing/RetailLogHandler.ts
- src/renderer/App.tsx
- src/renderer/AudioSourceControls.tsx
- src/renderer/CategoryPage.tsx
- src/renderer/DeleteDialog.tsx
- src/renderer/DiagnosticsDialog.tsx
- src/renderer/FlavourSettings.tsx
- src/renderer/InstantReplay.tsx
- src/renderer/KillVideoDialog.tsx
- src/renderer/Layout.tsx
- src/renderer/LockDialog.tsx
- src/renderer/SettingsPage.tsx
- src/renderer/SideMenu.tsx
- src/renderer/StorageFilterToggle.tsx
- src/renderer/TagDialog.tsx
- src/renderer/VideoCorrelator.ts
- src/renderer/VideoPlayer.tsx
- src/renderer/components/Dialog/Dialog.tsx
- src/renderer/components/Menu/Item.tsx
- src/renderer/components/Shortcuts/NavigateShortcut.tsx
- src/renderer/components/Shortcuts/SelectAllShortcut.tsx
- src/renderer/components/Shortcuts/SelectMultiShortcut.tsx
- src/renderer/components/Shortcuts/SelectRangeShortcut.tsx
- src/renderer/components/Tables/Cells.tsx
- src/renderer/components/Tables/LockButton.tsx
- src/renderer/components/Tables/MultiLockButton.tsx
- src/renderer/components/Tables/MultiTagButton.tsx
- src/renderer/components/Tables/Sorting.ts
- src/renderer/components/Tables/TagButton.tsx
- src/renderer/components/Tables/VideoSelectionTable.tsx
- src/renderer/components/Tables/useVideoSelectionTable.tsx
- src/renderer/components/Tooltip/Tooltip.tsx
- src/renderer/components/Viewpoints/ViewpointSelection.tsx
- src/renderer/containers/ApplicationStatusCard/ApplicationStatusCard.tsx
- src/renderer/containers/ApplicationStatusCard/Status.tsx
- src/renderer/icons/FolderLocked.tsx
- src/renderer/icons/FolderMessageSquare.tsx
- src/renderer/icons/FolderMessageSquareMore.tsx
- src/renderer/icons/FolderUnlocked.tsx
- src/renderer/preload.d.ts
- src/renderer/rendererutils.ts
- tests/logs/retail/coiled_altar_boss_hp.txt
- tests/src/retail/coiled_altar_boss_hp.py
- tests/src/test.py
