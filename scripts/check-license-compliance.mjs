import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  collectProductionPackages,
  getSourceConfiguration,
  packageIntegrityFor,
  readJson,
  repositoryRoot,
  sha256File,
} from './compliance-lib.mjs';

const errors = [];
const requiredLicense = 'GPL-2.0-only';
const rootPackage = readJson(join(repositoryRoot, 'package.json'));
const appPackage = readJson(join(repositoryRoot, 'release/app/package.json'));
const sourceConfig = getSourceConfiguration();

function requireCondition(condition, message) {
  if (!condition) errors.push(message);
}

requireCondition(
  rootPackage.license === requiredLicense,
  `package.json must declare ${requiredLicense}.`,
);
requireCondition(
  appPackage.license === requiredLicense,
  `release/app/package.json must declare ${requiredLicense}.`,
);

for (const file of [
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'FORK_NOTICE.md',
  'MODIFICATIONS.md',
]) {
  requireCondition(existsSync(join(repositoryRoot, file)), `${file} is required.`);
}

const license = readFileSync(join(repositoryRoot, 'LICENSE'), 'utf8');
requireCondition(
  license.includes('SPDX-License-Identifier: GPL-2.0-only'),
  'LICENSE must contain the selected SPDX identifier.',
);

const readme = readFileSync(join(repositoryRoot, 'README.md'), 'utf8');
requireCondition(
  readme.includes('not endorsed by or affiliated with Blizzard Entertainment'),
  'README.md must contain the Blizzard trademark disclaimer.',
);
requireCondition(
  rootPackage.name === 'lappen-recorder' && appPackage.name === 'lappen-recorder',
  'Both package manifests must use the fork package identity.',
);
requireCondition(
  rootPackage.build?.appId === 'io.github.suitablyat.lappenrecorder',
  'The Windows application ID must be unique to the fork.',
);
requireCondition(
  rootPackage.build?.publish?.owner === 'suitablyat'
    && rootPackage.build?.publish?.repo === 'lappen-recorder',
  'The auto-update feed must point to the fork repository.',
);
requireCondition(
  rootPackage.repository?.url?.includes('suitablyat/lappen-recorder'),
  'The package repository must point to the fork.',
);
requireCondition(
  !JSON.stringify(rootPackage.build).includes('Warcraft Recorder LTD'),
  'Fork builds must not request the upstream code-signing identity.',
);

const noobs = sourceConfig.components.find((component) => component.id === 'noobs');
requireCondition(noobs?.version === appPackage.dependencies.noobs.replace(/^\^/, ''),
  'The noobs source pin must match release/app/package.json.');
requireCondition(
  noobs?.packageIntegrity === packageIntegrityFor('noobs'),
  'The noobs npm integrity must match release/app/package-lock.json.',
);

for (const component of sourceConfig.components) {
  requireCondition(
    /^[0-9a-f]{40}$/.test(component.sourceCommit),
    `${component.name} must have a full 40-character source commit.`,
  );
  requireCondition(
    component.repository.startsWith('https://github.com/'),
    `${component.name} must have an HTTPS source repository.`,
  );
  requireCondition(
    component.archiveName.endsWith('-source.zip'),
    `${component.name} must define a retained source archive name.`,
  );
  if (component.binarySha256) {
    const binaryPath = join(repositoryRoot, component.binaryPath);
    requireCondition(
      existsSync(binaryPath),
      `${component.name} pinned binary is missing: ${component.binaryPath}.`,
    );
    if (existsSync(binaryPath)) {
      requireCondition(
        sha256File(binaryPath) === component.binarySha256,
        `${component.name} binary hash changed; update and verify its source pin before release.`,
      );
    }
  }
}

const forbiddenLicenses = /UNLICENSED|PROPRIETARY|NONCOMMERCIAL|SEE LICENSE IN/i;
for (const dependency of collectProductionPackages()) {
  requireCondition(
    dependency.license !== 'UNKNOWN' || dependency.noticeFiles.length > 0,
    `${dependency.key} has neither license metadata nor an included notice.`,
  );
  requireCondition(
    !forbiddenLicenses.test(String(dependency.license)),
    `${dependency.key} declares a forbidden or unresolved license: ${dependency.license}.`,
  );
}

const ffmpeg = sourceConfig.components.find((component) => component.id === 'ffmpeg');
const ffmpegPath = join(repositoryRoot, ffmpeg.binaryPath);
if (existsSync(ffmpegPath)) {
  const versionOutput = execFileSync(ffmpegPath, ['-version'], {
    encoding: 'utf8',
  });
  requireCondition(
    versionOutput.startsWith(`ffmpeg version ${ffmpeg.version}`),
    'The bundled FFmpeg version does not match release/source-components.json.',
  );
  for (const flag of ffmpeg.requiredBuildFlags) {
    requireCondition(
      versionOutput.includes(flag),
      `The bundled FFmpeg configuration is missing ${flag}.`,
    );
  }
}

try {
  execFileSync(process.execPath, [
    join(repositoryRoot, 'scripts/generate-third-party-notices.mjs'),
    '--check',
  ], { stdio: 'inherit' });
} catch {
  errors.push('THIRD_PARTY_NOTICES.md is not current.');
}

if (errors.length > 0) {
  console.error(`License compliance failed:\n- ${errors.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log('License compliance checks passed.');
}
