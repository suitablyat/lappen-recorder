# Release signing architecture

## Status

The repository is prepared for SignPath Foundation, but production signing is
not active until the project is accepted and the SignPath project, artifact
configuration, signing policy, and API token have been provisioned.

## Current release coupling

- Electron Builder creates the Windows application, NSIS installer,
  `latest.yml`, and differential-update blockmap in one local packaging run.
- The existing CI workflow builds and tests the application but deliberately
  does not package it. Its only signing guidance refers to a maintainer-owned EV
  hardware token.
- With no local certificate or signing service configured, Electron Builder
  emits an unsigned application and installer without making packaging fail.
- The installer bytes are coupled to `latest.yml` and the `.blockmap`: signing
  changes the installer's size and SHA-512 hash, so update metadata generated
  before signing must not be published.
- Release compliance assets are attached separately after a draft release is
  created. This GPL compliance workflow remains required and is not replaced by
  code signing.

## Target release architecture

1. A maintainer tags the exact clean release commit.
2. A manually dispatched GitHub-hosted Windows workflow checks out that tag,
   validates it against `release/app/package.json`, and builds the unsigned
   installer.
3. The workflow uploads the unsigned installer as a GitHub Actions artifact and
   submits that immutable artifact to SignPath through its GitHub connector.
4. SignPath verifies the repository and workflow origin. A designated approver
   manually approves the release-signing request.
5. SignPath signs the installer with the certificate issued to SignPath
   Foundation and returns the signed installer. The private key remains in
   SignPath's HSM.
6. The workflow requires a valid, timestamped Authenticode signature whose
   subject contains `SignPath Foundation`.
7. The workflow regenerates the differential-update blockmap and `latest.yml`
   from the signed installer, then uploads a reviewable signed release bundle.
8. A maintainer attaches the reviewed bundle to a draft GitHub release, runs
   the existing compliance workflow, verifies the source links, and only then
   publishes the release.

The signing workflow is manual-only. It is not available to pull requests or
fork builds, has read-only repository permissions, and never publishes a
release by itself.

The repository-specific application details and post-acceptance checklist are
in [SignPathApplication.md](SignPathApplication.md).

## SignPath configuration

After acceptance, configure these repository-level GitHub Actions variables:

- `SIGNPATH_ORGANIZATION_ID`
- `SIGNPATH_PROJECT_SLUG`
- `SIGNPATH_SIGNING_POLICY_SLUG`
- `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG`

Configure `SIGNPATH_API_TOKEN` as a GitHub Actions secret. Never store the token
in a repository variable, workflow file, build artifact, or release log.

In SignPath:

- install the SignPath GitHub App for this repository;
- link the predefined GitHub.com trusted build system to the project;
- enable trusted-build-system and origin verification for the release policy;
- require manual approval by a listed project approver;
- restrict release signing to this repository and release tags based on
  protected `main`;
- create the artifact configuration by analyzing an unsigned Lappen Recorder
  installer sample;
- restrict the root PE metadata to product name `Lappen Recorder` and require
  the submitted version to match the release version; and
- sign only project-owned artifacts. Do not apply the project signature to
  redistributed OBS, Electron, FFmpeg, `noobs`, or other third-party binaries.

The initial configuration signs the final NSIS installer. Whether SignPath can
safely deep-sign the project-owned application executable inside this specific
NSIS layout must be decided after its artifact analyzer has inspected a sample.
Deep signing must exclude third-party binaries. If the analyzer cannot safely
express that boundary, keep installer signing and add a reviewed two-stage app
signing/package process later.

## Security decisions

- No certificate file, PFX password, private key, or hardware-token credential
  is stored in GitHub. SignPath retains the private key in its HSM.
- Non-secret SignPath identifiers use repository variables; the API token uses
  GitHub Actions secrets.
- The workflow fails closed when any required setting is absent.
- Production signing requires a GitHub manual dispatch and a separate SignPath
  approval.
- Unsigned and signed artifacts have distinct names and locations to avoid
  accidentally publishing the unsigned installer.
- Signature verification checks trust status, publisher subject, and timestamp
  before update metadata is regenerated.
- Signing does not replace tests, GPL corresponding-source publication, malware
  scanning, or release review.

## Unsupported until enrollment is complete

- The workflow cannot sign without SignPath acceptance and provisioned values.
- Existing installers remain unsigned; signatures are never retroactively
  implied.
- Automatic publication of signed assets is intentionally disabled.
- Deep signing of nested project-owned executables is pending artifact analysis.
