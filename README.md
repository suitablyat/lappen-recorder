# Warcraft Recorder
![GitHub all releases](https://img.shields.io/github/downloads/aza547/wow-recorder/total)
![Version](https://img.shields.io/github/package-json/v/aza547/wow-recorder?filename=release%2Fapp%2Fpackage.json)
![Discord](https://img.shields.io/discord/1004860808737591326)

Warcraft Recorder is a desktop screen recorder. It watches the WoW combat log file for interesting events, records them, and presents a user interface in which the recordings can be viewed. 

## Development setup

### Prerequisites

- Windows x64 (macOS and Linux are not supported).
- Node.js 24 and npm 10, matching the current CI environment.
- Git. Python 3 is only required for the optional integration tests in `tests/`.
- World of Warcraft is required for end-to-end recording tests, but not for unit tests or production builds.

The npm postinstall step installs and rebuilds the Electron-native OBS and global-input dependencies. Prebuilt binaries are normally used; a supported Visual Studio C++ build environment may be required if a native dependency must compile locally.

### Installation

```powershell
npm install
```

If PowerShell execution policy blocks `npm.ps1`, use `npm.cmd` in place of `npm`.

### Environment setup

No `.env` file or environment variables are required for normal development. Application settings are created at runtime with `electron-store`; do not commit generated configuration or credentials. Remote storage is disabled by default. To exercise it, configure a Nextcloud or generic WebDAV server in the application's Remote Storage settings; passwords are entered in the UI and protected with Electron `safeStorage`.

### Development command

```powershell
npm start
```

### Test command

```powershell
npm test
```

Linting is available separately with `npm run lint`. The integration suite is documented in [`tests/README.md`](tests/README.md) and requires a running Warcraft Recorder instance, World of Warcraft, configured local paths, and Python 3.

### Build command

```powershell
npm run build
```

Use `npm run package` only when creating a Windows installer; release signing is maintainer-specific.

### Known limitations

- Development and runtime support are Windows-only.
- Recording depends on the packaged native OBS (`noobs`) binaries, supported capture hardware/drivers, and a valid WoW combat-log directory.
- The standalone TypeScript compiler is not currently a supported check: Webpack builds use transpile-only mode, and dependency declarations do not pass the repository's current TypeScript module-resolution settings.
- The existing lint configuration reports legacy violations that do not prevent the application from building or running.

<img width="1920" height="1032" alt="image" src="https://github.com/user-attachments/assets/aea579e3-5a7f-477d-bea0-273556a3ef9b" />

#  How to Use
1. Download and run the most recent [Warcraft Recorder installer](https://github.com/aza547/wow-recorder/releases/latest).
2. Launch the application and click the Settings button.
    - Create a folder on your PC to store the recordings.
    - Set the Storage Path to the folder you just created.
    - Enable recording and set the location of your World of Warcraft logs folder.
    - Modify any other settings as desired.
3. Click the Scene button and configure the OBS scene and recording settings.
    - Select your desired output resolution.
    - Add your speakers and/or microphone if you want to include audio.
    - Recommend selecting a hardware encoder, if available.
    - Modify any other settings as desired.
5. Install the required combat logging addon, enabling advanced combat logging when prompted.
    - Retail: SimpleCombatLogger ([CurseForge](https://www.curseforge.com/wow/addons/simplecombatlogger), [Wago](https://addons.wago.io/addons/simplecombatlogger)).
    - Classic: AutoCombatLogger ([CurseForge](https://www.curseforge.com/wow/addons/autocombatlogger), [Wago](https://addons.wago.io/addons/autocombatlogger)). 
    - Classic Era: AutoCombatLogger ([CurseForge](https://www.curseforge.com/wow/addons/autocombatlogger), [Wago](https://addons.wago.io/addons/autocombatlogger)). 

# Supported Platforms

| OS | Support |
|---|---|
| Windows | Yes |
| Mac | No |
| Linux | No |

| Flavour | Support |
|---|---|
| Retail | Yes |
| MoP Classic | Yes |
| Classic Anniversary | Best Effort |
| Classic Era | SoD Raids Only |

# Testing It Works
You can test that Warcraft Recorder works by clicking the test icon with World of Warcraft running after you have completed the above setup steps. This runs a short test of the recording function.

# Bug Reports & Suggestions

Please create an issue, I will get to it eventually. Bear in mind maintaining this is a hobby for me, so it may take me some time to comment. If you think you can improve something, feel free to submit a PR.

I've created a dedicated discord for this project, feel free to join [here](https://discord.gg/NPha7KdjVk).

# Contributing

If you're interested in getting involved please drop me a message on discord and I can give you access to our development channel. Also see [contributing](https://github.com/aza547/wow-recorder/blob/main/docs/CONTRIBUTING.md) docs.

# Mentions

The recording done by Warcraft Recorder is made possible by packaging up [OBS](https://obsproject.com/). We wouldn't stand a chance at providing something useful without it. Big thanks to the OBS developers.

The app is built with [Electron](https://www.electronjs.org/) and [React](https://react.dev/), using the boilerplate provided by the [ERB](https://electron-react-boilerplate.js.org/) project. 

Drawing overlay created using [Excalidraw](https://github.com/excalidraw/excalidraw).
