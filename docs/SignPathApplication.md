# SignPath Foundation application checklist

Submit the application only after this preparation is merged into the public
default branch so SignPath can verify every linked policy and workflow.

## Project details

- **Project name:** Lappen Recorder
- **Repository:** https://github.com/suitablyat/lappen-recorder
- **License:** GNU General Public License version 2 only (`GPL-2.0-only`)
- **Download page:** https://github.com/suitablyat/lappen-recorder/releases
- **Code signing policy:**
  https://github.com/suitablyat/lappen-recorder/blob/main/docs/CODE_SIGNING_POLICY.md
- **Privacy statement:**
  https://github.com/suitablyat/lappen-recorder/blob/main/PRIVACY.md
- **Build workflow:**
  https://github.com/suitablyat/lappen-recorder/blob/main/.github/workflows/signpath-release.yml
- **Maintainer/contact:** https://github.com/suitablyat

Suggested description:

> Lappen Recorder is a GPL-2.0-only Windows desktop recorder for World of
> Warcraft gameplay. It records locally through packaged OBS components and
> works without an account. Users may optionally configure their own Nextcloud
> or generic WebDAV server. It is an independently maintained, visibly branded
> fork of Warcraft Recorder.

## Requested signing scope

Request Authenticode signing for the project-owned Lappen Recorder NSIS
installer named `LappenRecorder-Setup-<version>.exe`. The initial artifact
configuration should sign the final installer and restrict its PE product name
to `Lappen Recorder` and its product version to the submitted `version`
parameter.

Ask SignPath to analyze an unsigned installer sample before enabling any nested
signing. Redistributed OBS, Electron, FFmpeg, `noobs`, and other third-party
binaries must not receive the Lappen Recorder project signature. Nested signing
may be enabled later only for binaries that the artifact configuration can
reliably identify as project-owned.

## Before submitting

- Confirm the repository and at least one downloadable release are public.
- Enable multi-factor authentication on GitHub for every listed project role.
- Confirm the code-signing policy, privacy statement, license, fork notice, and
  release workflow are present on `main`.
- Prepare one unsigned installer sample from the exact public source tag.
- Confirm application and installer metadata use `Lappen Recorder`, not the
  upstream Warcraft Recorder signing identity.
- Review the SignPath Foundation conditions and verify the project still meets
  them before agreeing to the application.

## After acceptance

1. Install the SignPath GitHub App for this repository.
2. Link SignPath's predefined GitHub.com trusted build system to the project.
3. Create the artifact configuration from the sample and configure its
   `version` parameter.
4. Create an origin-verified release signing policy with manual approval.
5. Create a least-privilege API token for the workflow submitter.
6. Add the four non-secret IDs as GitHub Actions repository variables and add
   the API token as the `SIGNPATH_API_TOKEN` repository secret.
7. Protect `main`, the signing workflow, and signing-policy documents with
   required review rules appropriate for the maintainer team.
8. Run the workflow against a release-candidate tag and inspect the signed
   artifact before publishing anything.
