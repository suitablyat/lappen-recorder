# Code signing policy

Free code signing is provided by
[SignPath.io](https://about.signpath.io/), certificate by
[SignPath Foundation](https://signpath.org/).

This policy becomes operational after SignPath Foundation accepts Lappen
Recorder and provisions its signing project. Until then, release files may be
unsigned and must not claim SignPath Foundation as their publisher.

## Signed artifacts

Only release artifacts built from the public
[Lappen Recorder repository](https://github.com/suitablyat/lappen-recorder) by
the repository's trusted GitHub Actions workflow may be submitted for signing.
The signing policy is restricted to release tags based on reviewed `main`
commits. It must never be used for upstream Warcraft Recorder artifacts,
third-party projects, local experimental builds, or unrelated binaries.

The final NSIS installer is the initial signing scope. Nested project-owned
binaries may be added only after SignPath artifact analysis can distinguish them
from redistributed third-party components. Lappen Recorder does not re-sign
OBS, Electron, FFmpeg, `noobs`, or other third-party binaries with its project
certificate.

## Team roles

- Committer and reviewer: [@suitablyat](https://github.com/suitablyat)
- Signing approver: [@suitablyat](https://github.com/suitablyat)

Changes from contributors without direct write access require review by a
listed reviewer before merging. Every production signing request requires
manual approval by a listed signing approver. Role changes must update this
policy before the affected person participates in release signing.

All committers, reviewers, and signing approvers must enable multi-factor
authentication for both GitHub and SignPath.

## Release controls

Production releases must follow these controls:

1. Tests, lint, build, and license-compliance checks pass for the release
   commit.
2. The release commit is tagged with the version declared in
   `release/app/package.json`.
3. GitHub Actions builds the unsigned installer from that exact tag on a
   GitHub-hosted Windows runner.
4. SignPath verifies build origin and requires manual approval.
5. The returned installer has a valid timestamped Authenticode signature for
   SignPath Foundation.
6. Update metadata and the differential blockmap are generated from the signed
   installer, never from its unsigned predecessor.
7. The installer, hashes, notices, release manifest, and exact corresponding
   source are reviewed together on a draft GitHub release before publication.

The detailed design and enrollment settings are documented in
[ReleaseSigningArchitecture.md](ReleaseSigningArchitecture.md).

## Privacy

Lappen Recorder's network behavior and local-data handling are documented in
the project [privacy statement](../PRIVACY.md). The application has no
proprietary account service or centralized telemetry service. Optional remote
storage communicates only with the server configured by the user.
