# Privacy statement

Lappen Recorder is a local-first desktop application. Recordings, recording
metadata, configuration, and logs are stored on the user's computer unless the
user enables or invokes a feature that transfers them elsewhere. The project
does not operate an account service, subscription service, analytics service,
advertising service, or crash-report collection service.

## Network connections

The packaged application can make the following network connections:

- **Application updates:** the application checks the Lappen Recorder GitHub
  Releases feed when it starts and approximately every 24 hours while running.
  Electron Updater may download an available update before asking the user to
  install it. These requests disclose normal connection metadata, such as the
  user's IP address and client headers, to GitHub and its delivery providers.
- **Interface font:** the renderer currently requests the Inter font stylesheet
  and font files from Google-hosted font services. These requests disclose
  normal connection metadata to Google and its delivery providers.
- **Optional remote storage:** when a user explicitly enables and configures
  Nextcloud or generic WebDAV, the application connects to that server for
  connection tests and requested or configured automatic storage operations.
  Depending on enabled features, it can transfer recordings, video metadata,
  provider-hosted chat data, and share-link requests. Credentials are sent only
  to the configured server endpoint and are protected locally with Electron
  `safeStorage` where available.
- **Links opened by the user:** documentation, support, addon, and other
  external links open only when the user selects them and are then governed by
  the destination's privacy policy.

Remote storage is disabled by default. Lappen Recorder does not route WebDAV or
Nextcloud content through a project-operated backend. Operators of GitHub,
Google-hosted fonts, and any user-selected remote-storage server process data
under their own terms and privacy policies.

## Local data

Application settings and logs remain in the Lappen Recorder application-data
directory. Recordings and their metadata remain in the configured local storage
directory unless remote storage is enabled. Uninstall behavior is controlled by
the installer and may remove application settings; users should manage retained
recordings separately.

Logs can contain operational filenames and game-related metadata. Users should
review diagnostic material before sharing it publicly. Passwords, app
passwords, and Authorization headers are not intended to be written to logs or
exposed through renderer IPC.

## Changes and questions

Material changes to network behavior or data handling must update this
statement in the same pull request. Questions and non-sensitive reports can be
filed in the project's
[GitHub issue tracker](https://github.com/suitablyat/lappen-recorder/issues).
Do not post passwords, access tokens, private recordings, or other secrets in a
public issue.
