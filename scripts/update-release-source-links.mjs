import { readFileSync } from 'node:fs';

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const tag = process.argv[2] || process.env.GITHUB_REF_NAME;
const manifestPath = process.argv[3] || 'release/compliance/RELEASE_MANIFEST.json';

if (!token || !repository || !tag) {
  throw new Error('GITHUB_TOKEN, GITHUB_REPOSITORY, and a release tag are required.');
}

const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
};
const api = `https://api.github.com/repos/${repository}`;
const releaseResponse = await fetch(`${api}/releases/tags/${encodeURIComponent(tag)}`, {
  headers,
});
if (!releaseResponse.ok) {
  throw new Error(`Unable to read release ${tag}: HTTP ${releaseResponse.status}`);
}

const release = await releaseResponse.json();
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const assetBase = `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}`;
const assetUrl = (name) => `${assetBase}/${encodeURIComponent(name)}`;
const markerStart = '<!-- source-downloads:start -->';
const markerEnd = '<!-- source-downloads:end -->';
const sourceLines = manifest.sources.map(
  (source) =>
    `- [${source.name} ${source.version} source](${assetUrl(source.sourceArchive)}) - commit \`${source.sourceCommit}\`, SHA-256 \`${source.sourceArchiveSha256}\``,
);
const sourceLinks = manifest.sources
  .map((source) => `[${source.name} source](${assetUrl(source.sourceArchive)})`)
  .join(', ');
const installerLines = manifest.artifacts
  .filter((artifact) => artifact.name.toLowerCase().endsWith('.exe'))
  .map(
    (artifact) =>
      `- [${artifact.name}](${assetUrl(artifact.name)}) (SHA-256 \`${artifact.sha256}\`) - matching source: ${sourceLinks}; [manifest](${assetUrl('RELEASE_MANIFEST.json')}); [notices](${assetUrl('THIRD_PARTY_NOTICES.md')})`,
  );
const section = [
  markerStart,
  '## Installer and matching source',
  '',
  ...installerLines,
  ...(installerLines.length === 0
    ? ['No installer artifact was recorded; keep this release as a draft.']
    : []),
  '',
  '### Source code and license material',
  '',
  'These archives are retained for as long as this release installer remains downloadable:',
  '',
  ...sourceLines,
  `- [Release manifest](${assetUrl('RELEASE_MANIFEST.json')})`,
  `- [Third-party notices](${assetUrl('THIRD_PARTY_NOTICES.md')})`,
  markerEnd,
].join('\n');
const priorBody = String(release.body || '')
  .replace(new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}`, 'g'), '')
  .trim();
const body = `${priorBody}${priorBody ? '\n\n' : ''}${section}\n`;

const updateResponse = await fetch(`${api}/releases/${release.id}`, {
  method: 'PATCH',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ body }),
});
if (!updateResponse.ok) {
  throw new Error(`Unable to update release ${tag}: HTTP ${updateResponse.status}`);
}
console.log(`Updated ${tag} with installer-adjacent retained source links.`);
