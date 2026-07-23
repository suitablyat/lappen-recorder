# Contributing

The below steps describe development on Windows. The app is currently not supported on other operating systems. 

## Contribution license

Lappen Recorder is licensed under GNU GPL version 2 only
(`GPL-2.0-only`). By submitting a contribution, you represent that you have the
right to submit it and agree to license it under `GPL-2.0-only`, without adding
terms that would prevent the project from distributing the combined work under
that license. Preserve existing copyright, license, attribution, and modification
notices. Identify third-party code or assets and their licenses in the pull
request; do not submit material whose redistribution rights are unclear.
Contributors must update `MODIFICATIONS.md` when a change materially alters the
fork's behavior, distribution, branding, or license-compliance process. Do not
remove the upstream provenance recorded in `FORK_NOTICE.md`.

## Architecture
Once I drew the structure of the application in Excalidraw. You can see that below. It's a rough overview of the key parts and may be a useful overview for any interested developers.
![](https://i.imgur.com/UbZ0aWY.png)
You can find the source in the `design.excalidraw` file in this directory.

## Start in Development Mode
Development mode benefits from the infrastructure offered by [electron-react-boilerplate](https://github.com/electron-react-boilerplate/electron-react-boilerplate). You can read more about it on their [docs](https://electron-react-boilerplate.js.org/). It allows for a very quick development cycle, access to chrome dev tools, and hot reloading of the app on saving new changes. 

1. Install Node.js 24 and npm 10, matching the CI environment, from [nodejs.org](https://nodejs.org/).
1. Clone a copy of the [Lappen Recorder](https://github.com/suitablyat/lappen-recorder) codebase.
1. Change into the checkout directory. 
1. Run `npm install` on the command line to install required node packages.
1. Run `npm start` to launch the application in development mode.

## Building, Packaging and Releasing
CI verifies license compliance and production builds for pushes and pull requests to `main`. Release installers are built from an exact clean commit. The SignPath workflow described below is present but cannot sign until SignPath Foundation accepts and provisions the project.
1. Build the electron application.
    1. Update the version number in `./release/app/package.json` if appropriate.  
    1. Update `./release/source-components.json` whenever the packaged `noobs`, OBS, or FFmpeg revision changes.
    1. Commit the exact source that will be released. Release manifests deliberately reject dirty worktrees because an uncommitted build cannot be matched to a source commit.
    1. Run `npm run compliance:release` and review `THIRD_PARTY_NOTICES.md` and `release/compliance/RELEASE_MANIFEST.json`.
    1. Run `npm run package` to build the electron application when preparing an unsigned local test or SignPath artifact sample.
1. Install the .exe and run the tests to make sure you've not broken something crass.
    1. With Lappen Recorder open, run: `python .\resources\test-scripts\all_tests.py`.
    1. Manually check the app behaves as expected while this runs.
        1. Recordings are created.
        1. Appropriate metadata is created.
        1. User experience has not degraded.
1. Sign the release after SignPath enrollment.
    1. Push the exact release commit to `main` and create a version tag matching `release/app/package.json`, for example `v8.0.0`.
    1. Manually run the `Build and sign Windows release` workflow with that tag.
    1. Approve the request in SignPath after reviewing its verified repository, commit, tag, workflow, version, and artifact metadata.
    1. Download the `signed-release-<tag>` workflow artifact.
    1. Run `scripts/verify-windows-signature.ps1` against the downloaded installer and confirm the publisher contains `SignPath Foundation` and a timestamp authority is present.
    1. Confirm `latest.yml` and the `.blockmap` came from the same workflow. Never reuse update metadata generated for the unsigned installer because signing changes its bytes.
1. Share the application.
    1. Update the CHANGELOG.md with the new version number and change details. 
    1. Commit and push all changes.
    1. Create a **draft** GitHub release for the exact signed tag. Attach the three files from the reviewed signed workflow artifact:
      - `LappenRecorder-Setup-X.Y.Z.exe` to enable installation.
      - `latest.yml` to allow the auto updater to function.
      - `LappenRecorder-Setup-X.Y.Z.exe.blockmap` to allow the auto updater to function.
    1. Manually run the `Publish release compliance artifacts` workflow for the draft's tag. It attaches the exact Lappen Recorder, `noobs`, OBS, and FFmpeg source archives, `THIRD_PARTY_NOTICES.md`, and `RELEASE_MANIFEST.json`, then places matching-source links beside every installer in the release notes.
    1. Confirm the draft installer has matching source links and hashes on the same release page, then publish it. Publishing runs the workflow again as an idempotent verification/repair step. If either run fails, keep the release as a draft until it is corrected.

### Source retention policy

Corresponding-source archives and the release manifest must remain downloadable
for at least as long as any installer or update artifact from that release is
available. Do not delete or replace a source archive independently. If source can
no longer be retained, remove the corresponding installer, blockmap, and update
metadata as well. The release workflow can be run manually with an existing tag
to restore or verify compliance assets for an older release.

## Tests
1. Run `npm test` to run the UTs. 
    1. These are `jest` based unit tests. 
    2. Note: This is a WIP - the UTs currently are not useful.
2. To run end-to-end tests (requires some hardcoded path updates):
    * All tests: `python .\resources\test-scripts\all_tests.py`.
    * Individual test: `python  .\resources\test-scripts\retail_mythic_plus.py`.

## Debugging Mode
You can use VSCode's JavaScript Debug terminal to step through the code, add breakpoints, view variables and the other IDE features.  

1. Go to file, new terminal. 
1. Click the arrow next to the "+" icon. 
1. Select "JavaScrtip Debug Terminal". See below image.
1. Run the application in development mode as per above instructions (i.e. `npm start`).
1. Enjoy the ability to use the IDE features.

<img src="https://i.imgur.com/zFIaGHa.png" width="200">

## Debugging in Production with Dev Tools
From [here](https://electron-react-boilerplate.js.org/docs/packaging).

`npx cross-env DEBUG_PROD=true npm run package`

## Building OSN
> Advice is not to build this and just get it from the folks at Streamlabs. I built it once, it was a total faff.
> If you really need to build it, you can probably find some useful notes in the history of this doc. 
> This is hosted by streamlabs here (note version number): 
> - https://s3-us-west-2.amazonaws.com/obsstudionodes3.streamlabs.com/osn-0.23.59-release-win64.tar.gz

The above is no longer true, I'm now rebuilding OSN to add force stop functionality. Follow the OSN build instructions and then do:
`tar -czvf osn-0.25.34wcr-release-win64.tar.gz -C build/distribute/ obs-studio-node` to get an archive ready for use.

Below are various additional OSN resources:
- [Example](https://github.com/Envek/obs-studio-node-example)
- [Community Docs](https://github.com/hrueger/obs-studio-node-docs)
- [Streamlabs Desktop](https://github.com/stream-labs/desktop)
- [AdvancedRecordingFactory API](https://github.com/stream-labs/obs-studio-node/pull/1128)
- [OSN Tests](https://github.com/stream-labs/obs-studio-node/tree/staging/tests/osn-tests/src)

## Windows reputation and unsigned emergency builds

The production signing design and policy are documented in
[`CODE_SIGNING_POLICY.md`](CODE_SIGNING_POLICY.md) and
[`ReleaseSigningArchitecture.md`](ReleaseSigningArchitecture.md). Fork
maintainers must use only a signing identity authorized for this fork and must
never configure or claim the upstream signing identity. Until SignPath
enrollment is complete, or if an explicitly documented emergency forces an
unsigned build, Windows may warn that the installer is unrecognized.

1. Submit it for analysis [here](https://www.microsoft.com/en-us/wdsi/filesubmission) after releasing it to make that warning go away.
    1. Select "Microsoft Defender Smartscreen" as the security product. 
    1. "Company name" - just put your own name. 
    1. "Do you have a Microsoft support case number?" - No.
    1. Leave next few fields blank/unchanged. 
    1. Select & upload the .exe. 
    1. "What do you believe this file is?" - Incorrectly detected as malware/malicious
    1. Detection name - "LappenRecorder-Setup-X.Y.Z.exe"
    1. "Additional information" - whatever, I'm sure no one will read it. 
1. This isn't instant but seems to get resolved within 24 hours, that seems good enough. 
