import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import {
  getSourceConfiguration,
  githubArchiveUrl,
  packageIntegrityFor,
  readJson,
  repositoryRoot,
  sha256File,
} from './compliance-lib.mjs';

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function git(...args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
}

function currentRepository() {
  if (process.env.GITHUB_REPOSITORY) {
    return `https://github.com/${process.env.GITHUB_REPOSITORY}`;
  }
  return git('remote', 'get-url', 'origin')
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/^git\+/, '')
    .replace(/\.git$/, '');
}

async function download(url, destination) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Unable to download ${url}: HTTP ${response.status}`);
  }
  writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
}

const packageJson = readJson(join(repositoryRoot, 'release/app/package.json'));
const config = getSourceConfiguration();
const outputDirectory = resolve(
  repositoryRoot,
  argument('--output-dir', 'release/compliance'),
);
const artifactDirectory = argument('--artifacts-dir');
const downloadSources = process.argv.includes('--download-sources');
mkdirSync(outputDirectory, { recursive: true });

const repository = currentRepository();
const commit = git('rev-parse', 'HEAD');
if (process.argv.includes('--require-clean')) {
  const changes = git('status', '--porcelain');
  if (changes) {
    throw new Error(
      'Release manifests must be generated from a clean worktree. Commit the exact source before packaging.',
    );
  }
}
const applicationArchiveName = `LappenRecorder-${packageJson.version}-source.zip`;
const sources = [
  {
    id: 'lappen-recorder',
    name: 'Lappen Recorder',
    version: packageJson.version,
    repository,
    sourceCommit: commit,
    archiveName: applicationArchiveName,
  },
  ...config.components,
].map((component) => ({
  ...component,
  sourceUrl: githubArchiveUrl(component.repository, component.sourceCommit),
}));

if (downloadSources) {
  for (const source of sources) {
    const destination = join(outputDirectory, source.archiveName);
    await download(source.sourceUrl, destination);
    console.log(`Downloaded ${source.archiveName}`);
  }
}

const sourceEntries = sources.map((source) => {
  const archivePath = join(outputDirectory, source.archiveName);
  const binaryPath = source.binaryPath
    ? join(repositoryRoot, source.binaryPath)
    : null;
  return {
    id: source.id,
    name: source.name,
    version: source.version,
    repository: source.repository,
    sourceCommit: source.sourceCommit,
    sourceUrl: source.sourceUrl,
    sourceArchive: source.archiveName,
    sourceArchiveSha256: existsSync(archivePath)
      ? sha256File(archivePath)
      : null,
    packagedBinary: source.binaryPath || null,
    packagedBinarySha256:
      binaryPath && existsSync(binaryPath) ? sha256File(binaryPath) : null,
    packageIntegrity:
      source.id === 'noobs' ? packageIntegrityFor('noobs') : null,
  };
});

const artifacts = [];
if (artifactDirectory && existsSync(artifactDirectory)) {
  for (const name of readdirSync(artifactDirectory).sort()) {
    const path = join(artifactDirectory, name);
    if (!existsSync(path) || !statSync(path).isFile()) continue;
    artifacts.push({ name: basename(path), sha256: sha256File(path) });
  }
}

const manifest = {
  schemaVersion: 1,
  release: {
    version: packageJson.version,
    tag: argument('--tag', process.env.GITHUB_REF_NAME || null),
    repository,
    sourceCommit: commit,
  },
  sources: sourceEntries,
  artifacts,
};

const manifestPath = join(outputDirectory, 'RELEASE_MANIFEST.json');
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated ${manifestPath}`);
