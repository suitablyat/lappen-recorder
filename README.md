# Lappen Recorder

![GitHub all releases](https://img.shields.io/github/downloads/suitablyat/lappen-recorder/total)
![Version](https://img.shields.io/github/package-json/v/suitablyat/lappen-recorder?filename=release%2Fapp%2Fpackage.json)

Lappen Recorder is a Windows desktop recorder for World of Warcraft gameplay. It watches the combat log for interesting events, records them with OBS, and provides a local interface for viewing recordings. The application works offline by default; optional remote storage supports Nextcloud and generic WebDAV.

## Fork and upstream

This project is an independently maintained fork of [Warcraft Recorder](https://github.com/aza547/wow-recorder). It is not an official Warcraft Recorder release and is not maintained, supported, or endorsed by the upstream project or its maintainers. See [FORK_NOTICE.md](FORK_NOTICE.md) and [MODIFICATIONS.md](MODIFICATIONS.md) for provenance and a summary of fork changes.

Existing upstream copyrights and attribution are preserved. The fork's source history begins from upstream commit `5d17d0281ccd8bf7a1aa74a556e9ca5715783ad4`.

## Download and source

Download the latest [Lappen Recorder release](https://github.com/suitablyat/lappen-recorder/releases/latest). Every installer release must include links to the exact corresponding source archives, `RELEASE_MANIFEST.json`, hashes, and `THIRD_PARTY_NOTICES.md` on the same release page. Do not install a release if those source links are missing.

Changing the application identity gives Lappen Recorder its own Windows installation and application-data directory. It does not overwrite an installed upstream Warcraft Recorder copy. On first packaged launch, if the new profile has no configuration, compatible settings and encrypted remote-storage credentials are copied from the legacy `WarcraftRecorder` profile; the old files remain untouched. Existing recording folders and explicitly configured WebDAV base paths are not renamed.

## How to use

1. Install and launch Lappen Recorder.
2. Open Settings, select an empty local storage folder, enable the desired game modes, and set the World of Warcraft log directories.
3. Open Scene and configure the OBS scene, resolution, encoder, speakers, and microphone.
4. Install a combat logging addon and enable advanced combat logging when prompted:
   - Retail: SimpleCombatLogger ([CurseForge](https://www.curseforge.com/wow/addons/simplecombatlogger), [Wago](https://addons.wago.io/addons/simplecombatlogger)).
   - Classic and Classic Era: AutoCombatLogger ([CurseForge](https://www.curseforge.com/wow/addons/autocombatlogger), [Wago](https://addons.wago.io/addons/autocombatlogger)).
5. With World of Warcraft running, use the test button to verify recording.

## Supported platforms

| OS | Support |
|---|---|
| Windows | Yes |
| macOS | No |
| Linux | No |

| Game flavour | Support |
|---|---|
| Retail | Yes |
| MoP Classic | Yes |
| Classic Anniversary | Best effort |
| Classic Era | SoD raids only |

## Development

Prerequisites are Windows x64, Git, Node.js 24, and npm 10. Python 3 and World of Warcraft are required only for the optional integration tests.

```powershell
git clone https://github.com/suitablyat/lappen-recorder.git
cd lappen-recorder
npm install
npm start
```

Useful checks:

```powershell
npm test
npm run lint
npm run build
npm run compliance:check
```

Use `npm run package` only for a Windows release build. It regenerates third-party notices, checks license compliance, creates the release manifest, and rejects a dirty source tree before packaging. See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for the release process.

No `.env` file or account is required. Application settings are created at runtime. Remote storage is disabled by default; passwords entered for WebDAV are protected with Electron `safeStorage`.

## Issues and contributions

Report fork issues at [suitablyat/lappen-recorder](https://github.com/suitablyat/lappen-recorder/issues). Do not use upstream support channels for fork-specific problems. Contributions are accepted under `GPL-2.0-only`; see [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

## Code signing policy

Free code signing is provided by [SignPath.io](https://about.signpath.io/),
certificate by [SignPath Foundation](https://signpath.org/). Signing is pending
project enrollment; unsigned builds must not claim a SignPath publisher. See
the [code signing policy](docs/CODE_SIGNING_POLICY.md),
[release signing architecture](docs/ReleaseSigningArchitecture.md), and
[application checklist](docs/SignPathApplication.md), as well as the
[privacy statement](PRIVACY.md).

## License and trademarks

Lappen Recorder is distributed under GNU General Public License version 2 only (`GPL-2.0-only`). See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Lappen Recorder is an unofficial community project and is not endorsed by or affiliated with Blizzard Entertainment. It is also not sponsored, approved, maintained, or endorsed by the Warcraft Recorder project or its maintainers. Warcraft, World of Warcraft, Blizzard Entertainment, and related names, logos, and assets are trademarks or property of their respective owners. Their use is solely to identify compatibility and does not imply endorsement.

## Acknowledgements

Recording is provided by packaged [OBS](https://obsproject.com/) components. The app uses [Electron](https://www.electronjs.org/), [React](https://react.dev/), [Electron React Boilerplate](https://electron-react-boilerplate.js.org/), and [Excalidraw](https://github.com/excalidraw/excalidraw). Full dependency attribution is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
