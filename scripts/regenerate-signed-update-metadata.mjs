#!/usr/bin/env node

import { createRequire } from 'node:module';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const {
  buildBlockMap,
} = require('app-builder-lib/out/targets/blockmap/blockmap');

function readArgument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index === process.argv.length - 1) {
    throw new Error(`Missing required argument: ${name}`);
  }

  return process.argv[index + 1];
}

const installerPath = path.resolve(readArgument('--installer'));
const metadataPath = path.resolve(readArgument('--metadata'));
const expectedVersion = readArgument('--version');

if (path.extname(installerPath).toLowerCase() !== '.exe') {
  throw new Error(`Expected a Windows installer (.exe): ${installerPath}`);
}

await access(installerPath);
await access(metadataPath);

const metadata = yaml.load(await readFile(metadataPath, 'utf8'));
if (metadata === null || typeof metadata !== 'object') {
  throw new Error(`Invalid update metadata: ${metadataPath}`);
}

if (metadata.version !== expectedVersion) {
  throw new Error(
    `Update metadata version ${metadata.version} does not match ${expectedVersion}`,
  );
}

const installerName = path.basename(installerPath);
const blockmapPath = `${installerPath}.blockmap`;
const updateInfo = await buildBlockMap(installerPath, 'gzip', blockmapPath);

if (!Array.isArray(metadata.files)) {
  metadata.files = [];
}

const existingFile = metadata.files.find(
  (entry) => entry && path.basename(entry.url ?? '') === installerName,
);
const signedFile = existingFile ?? { url: installerName };
signedFile.url = installerName;
signedFile.sha512 = updateInfo.sha512;
signedFile.size = updateInfo.size;

metadata.files = [
  signedFile,
  ...metadata.files.filter((entry) => entry !== existingFile),
];
metadata.path = installerName;
metadata.sha512 = updateInfo.sha512;
metadata.releaseDate = new Date().toISOString();

await writeFile(
  metadataPath,
  yaml.dump(metadata, {
    lineWidth: -1,
    noRefs: true,
    quotingType: "'",
  }),
  'utf8',
);

console.log(`Regenerated ${path.basename(blockmapPath)} from signed installer`);
console.log(`Updated ${path.basename(metadataPath)} for ${installerName}`);
