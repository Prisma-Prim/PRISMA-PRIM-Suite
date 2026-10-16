// Packaging-only verified cache for the existing official Dockerfile indexes.
// docker save/load drops RepoDigests. Preserve the index -> platform manifest ->
// config digest proof so a warm archive is verified against reviewed FROM bytes.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = process.env.PACKAGING_IMAGE_DIRECTORY;
const digest = (bytes) =>
  'sha256:' + createHash('sha256').update(bytes).digest('hex');

function docker(args) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    timeout: 90_000,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function requireDigest(bytes, expected, label) {
  if (digest(bytes) !== expected) throw new Error(`${label}: digest mismatch.`);
  return JSON.parse(bytes);
}

// buildx prints a CLI line ending after raw JSON on some versions. Strip only
// that byte, and only when the remaining bytes match the reviewed digest.
function rawManifest(reference, expected) {
  const output = docker([
    'buildx',
    'imagetools',
    'inspect',
    '--raw',
    reference,
  ]);
  const bytes =
    digest(output) === expected ? output : output.replace(/\n$/, '');
  requireDigest(bytes, expected, 'Registry manifest');
  return bytes;
}

function imagesFrom(dockerfiles) {
  const sources = new Set(
    dockerfiles.flatMap(({ content }) =>
      [...content.matchAll(/^[ \t]*FROM[ \t]+(.+)$/gim)].map((match) => {
        const from = /^(\S+) AS \w+$/i.exec(match[1]);
        if (!from)
          throw new Error('Unexpected unverified packaging FROM instruction.');
        return from[1];
      }),
    ),
  );
  const images = [...sources].map((source) => {
    const match =
      /^public\.ecr\.aws\/docker\/library\/(node|nginx):[^@]+@(sha256:[a-f0-9]{64})$/.exec(
        source,
      );
    if (!match)
      throw new Error(
        'Packaging requires the existing pinned official Node/Nginx indexes.',
      );
    const [, name, indexDigest] = match;
    return {
      source,
      name,
      indexDigest,
      local: `prisma-prim-ci/packaging-${name}:${indexDigest.slice(7)}`,
    };
  });
  if (images.length !== 2 || new Set(images.map(({ name }) => name)).size !== 2)
    throw new Error(
      'Expected exactly one pinned Node index and one pinned Nginx index.',
    );
  return images;
}

function verifyProof(image) {
  const index = requireDigest(
    readFileSync(join(directory, `${image.name}-index.json`)),
    image.indexDigest,
    `${image.name} index`,
  );
  const platform = index.manifests?.filter(
    ({ platform }) =>
      platform?.os === 'linux' && platform?.architecture === 'amd64',
  );
  if (
    platform?.length !== 1 ||
    !/^sha256:[a-f0-9]{64}$/.test(platform[0].digest)
  )
    throw new Error(`${image.name}: expected one linux/amd64 manifest.`);
  const manifest = requireDigest(
    readFileSync(join(directory, `${image.name}-manifest.json`)),
    platform[0].digest,
    `${image.name} platform manifest`,
  );
  if (!/^sha256:[a-f0-9]{64}$/.test(manifest.config?.digest))
    throw new Error(`${image.name}: invalid image config digest.`);
  return manifest.config.digest;
}

function verifyLoaded(image, reference = image.local) {
  const expected = verifyProof(image);
  const actual = docker([
    'image',
    'inspect',
    '--format',
    '{{.Id}}',
    reference,
  ]).trim();
  if (actual !== expected)
    throw new Error(`${image.name}: loaded image config digest mismatch.`);
}

try {
  if (!directory)
    throw new Error(
      'PACKAGING_IMAGE_DIRECTORY must name the image cache directory.',
    );
  const mode = process.argv[2];
  if (!['acquire', 'load'].includes(mode))
    throw new Error('Usage: ci-packaging-images.mjs acquire|load');
  const dockerfiles = ['api', 'web'].map((name) => ({
    name,
    content: readFileSync(
      join(root, `deploy/railway/${name}.Dockerfile`),
      'utf8',
    ),
  }));
  const images = imagesFrom(dockerfiles);
  if (mode === 'acquire') {
    mkdirSync(directory, { recursive: true });
    for (const image of images) {
      console.log(
        `Acquiring verified pinned ${image.name} linux/amd64 image (90s per Docker operation).`,
      );
      const index = rawManifest(image.source, image.indexDigest);
      const parsed = requireDigest(
        index,
        image.indexDigest,
        `${image.name} index`,
      );
      const platform = parsed.manifests?.filter(
        ({ platform }) =>
          platform?.os === 'linux' && platform?.architecture === 'amd64',
      );
      if (
        platform?.length !== 1 ||
        !/^sha256:[a-f0-9]{64}$/.test(platform[0].digest)
      )
        throw new Error(`${image.name}: expected one linux/amd64 manifest.`);
      const child = image.source.split('@')[0] + '@' + platform[0].digest;
      const manifest = rawManifest(child, platform[0].digest);
      writeFileSync(join(directory, `${image.name}-index.json`), index);
      writeFileSync(join(directory, `${image.name}-manifest.json`), manifest);
      verifyProof(image);
      docker(['pull', '--platform', 'linux/amd64', image.source]);
      verifyLoaded(image, image.source);
      docker(['tag', image.source, image.local]);
    }
    docker([
      'save',
      '--output',
      join(directory, 'images.tar'),
      ...images.map(({ local }) => local),
    ]);
    console.log('Verified pinned packaging images archived.');
  } else {
    for (const image of images) verifyProof(image);
    docker(['load', '--input', join(directory, 'images.tar')]);
    for (const image of images) verifyLoaded(image);
    for (const { name, content } of dockerfiles) {
      const local = content.replace(
        /^[ \t]*FROM[ \t]+(\S+)( AS \w+)$/gim,
        (line, source, stage) => {
          const image = images.find((image) => image.source === source);
          if (!image)
            throw new Error('Unexpected unverified packaging base image.');
          return `FROM ${image.local}${stage}`;
        },
      );
      writeFileSync(join(directory, `${name}.Dockerfile`), local);
    }
    console.log(
      'Verified cached packaging images loaded offline; local Dockerfiles ready.',
    );
  }
} catch (error) {
  console.error(
    'Packaging base-image acquisition/verification failed; no unverified fallback.',
  );
  // Docker diagnostics contain only public image references, never environment
  // or credentials; do not print command objects or the inherited environment.
  console.error(error.stderr?.toString().trim() || error.message);
  process.exitCode = 1;
}
