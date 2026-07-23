import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
);

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function sha256File(path) {
  return sha256Buffer(readFileSync(path));
}

function normalizeRepository(repository, fallback) {
  const value =
    typeof repository === 'string' ? repository : repository?.url || fallback;
  const normalized = String(value || '')
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/\.git$/, '');
  if (/^[\w.-]+\/[\w.-]+$/.test(normalized)) {
    return `https://github.com/${normalized}`;
  }
  return normalized.replace(/^github:/, 'https://github.com/');
}

function normalizeLicense(packageJson, lockPackage) {
  const declared = packageJson.license || packageJson.licenses || lockPackage.license;
  if (Array.isArray(declared)) {
    return declared
      .map((license) => (typeof license === 'string' ? license : license?.type))
      .filter(Boolean)
      .join(' OR ');
  }
  if (declared && typeof declared === 'object') return declared.type || 'UNKNOWN';
  return declared || 'UNKNOWN';
}

function findNoticeFiles(packageDirectory) {
  if (!existsSync(packageDirectory)) return [];

  return readdirSync(packageDirectory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        /^(licen[cs]e|copying|notice|copyright)(\..*)?$/i.test(entry.name),
    )
    .map((entry) => join(packageDirectory, entry.name))
    .filter((path) => statSync(path).size <= 512 * 1024)
    .sort();
}

export function collectProductionPackages() {
  const installations = [
    { lock: 'package-lock.json', root: '.' },
    { lock: 'release/app/package-lock.json', root: 'release/app' },
  ];
  const packages = new Map();

  for (const installation of installations) {
    const lockPath = join(repositoryRoot, installation.lock);
    const lock = readJson(lockPath);
    for (const [location, lockPackage] of Object.entries(lock.packages || {})) {
      if (!location.includes('node_modules/') || lockPackage.dev === true) continue;

      const packageDirectory = join(
        repositoryRoot,
        installation.root,
        ...location.split('/'),
      );
      const packageJsonPath = join(packageDirectory, 'package.json');
      if (!existsSync(packageJsonPath)) continue;

      let packageJson;
      try {
        packageJson = readJson(packageJsonPath);
      } catch {
        continue;
      }

      if (!packageJson.name || !packageJson.version) continue;
      const key = `${packageJson.name}@${packageJson.version}`;
      if (packages.has(key)) continue;

      const noticeFiles = findNoticeFiles(packageDirectory).map((path) => ({
        name: path.slice(packageDirectory.length + 1).replaceAll('\\', '/'),
        text: readFileSync(path, 'utf8').replaceAll('\r\n', '\n').trim(),
      }));

      packages.set(key, {
        key,
        name: packageJson.name,
        version: packageJson.version,
        license: normalizeLicense(packageJson, lockPackage),
        repository: normalizeRepository(
          packageJson.repository,
          packageJson.homepage,
        ),
        noticeFiles,
      });
    }
  }

  return [...packages.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function getSourceConfiguration() {
  return readJson(join(repositoryRoot, 'release', 'source-components.json'));
}

export function githubArchiveUrl(repository, commit) {
  return `${repository}/archive/${commit}.zip`;
}

export function packageIntegrityFor(name) {
  const lock = readJson(join(repositoryRoot, 'release/app/package-lock.json'));
  return lock.packages?.[`node_modules/${name}`]?.integrity || null;
}
