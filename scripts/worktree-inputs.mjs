import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  watch,
} from 'node:fs';
import { homedir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';

export class PreparationError extends Error {}
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export function samePath(left, right) {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}
export function within(parent, child) {
  const part = relative(parent, child);
  return (
    part === '' ||
    (!isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`))
  );
}

export function canonicalPath(path) {
  let ancestor = resolve(path);
  while (!existsSync(ancestor)) {
    if (dirname(ancestor) === ancestor)
      throw new PreparationError('Cannot resolve the target path.');
    ancestor = dirname(ancestor);
  }
  if (lstatSync(ancestor).isSymbolicLink())
    throw new PreparationError(
      'Target and installation roots cannot be symlinks.',
    );
  return resolve(
    realpathSync.native(ancestor),
    relative(ancestor, resolve(path)),
  );
}

const omitted = new Set([
  '.git',
  'node_modules',
  '.worktrees',
  '.claude',
  '.pnpm-home',
  'dist',
  'test-results',
  'playwright-report',
]);
function fileIdentity(path) {
  const entry = lstatSync(path, { bigint: true });
  return {
    bytes: hash(readFileSync(path)),
    device: String(entry.dev),
    inode: String(entry.ino),
    modified: String(entry.mtimeNs),
    mode: String(entry.mode & 0o100n),
  };
}
function dependencyFiles(root, directory = root) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (omitted.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...dependencyFiles(root, path));
    else if (
      [
        'package.json',
        'pnpm-lock.yaml',
        'pnpm-workspace.yaml',
        '.npmrc',
        '.node-version',
        '.pnpmfile.cjs',
        'pnpmfile.cjs',
      ].includes(entry.name) ||
      relative(root, path).split(sep).includes('patches') ||
      entry.name.endsWith('.patch') ||
      entry.name === '.env' ||
      entry.name.startsWith('.env.')
    ) {
      if (!entry.isFile() || entry.isSymbolicLink())
        throw new PreparationError(
          'Dependency inputs must be regular private-worktree files.',
        );
      files.push(path);
    } else if (entry.isSymbolicLink())
      throw new PreparationError(
        'Source links make dependency discovery ambiguous; preserve them and prepare a regular isolated checkout.',
      );
  }
  return files;
}

export function preparationInputs(
  root,
  environment,
  configuration,
  toolVersion,
) {
  const selected = dependencyFiles(root);
  const config = JSON.parse(configuration);
  const addLocal = (path) => {
    const canonical = canonicalPath(path);
    if (!within(root, canonical))
      throw new PreparationError(
        'External local dependency or patch inputs are refused.',
      );
    const entry = lstatSync(path);
    if (entry.isSymbolicLink())
      throw new PreparationError('Local dependency inputs cannot be symlinks.');
    if (entry.isFile()) selected.push(path);
    else if (entry.isDirectory()) {
      for (const child of readdirSync(path))
        if (!['node_modules', '.git'].includes(child))
          addLocal(join(path, child));
    } else
      throw new PreparationError(
        'Local dependency inputs must be regular files.',
      );
  };
  for (const path of [...selected].filter(
    (path) => basename(path) === 'package.json',
  )) {
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    for (const dependencies of [
      manifest.dependencies,
      manifest.devDependencies,
      manifest.optionalDependencies,
    ])
      for (const value of Object.values(dependencies ?? {})) {
        const match =
          typeof value === 'string' && value.match(/^(?:file|link):(.+)$/u);
        if (match) addLocal(resolve(dirname(path), match[1]));
      }
    for (const patch of Object.values(manifest.pnpm?.patchedDependencies ?? {}))
      addLocal(resolve(root, typeof patch === 'string' ? patch : patch.path));
  }
  for (const patch of Object.values(
    config.patchedDependencies ?? config['patched-dependencies'] ?? {},
  ))
    addLocal(resolve(root, typeof patch === 'string' ? patch : patch.path));
  for (const pattern of config.packages ?? [])
    if (
      typeof pattern !== 'string' ||
      isAbsolute(pattern) ||
      pattern.split(/[\\/]/u).includes('..')
    )
      throw new PreparationError(
        'Workspace packages must remain inside the private worktree.',
      );
  const files = [...new Set(selected)].sort();
  const values = files.map((path) => [
    relative(root, path),
    fileIdentity(path),
  ]);
  for (const path of new Set([
    join(homedir(), '.npmrc'),
    join(homedir(), '.config/pnpm/rc'),
    ...(environment.XDG_CONFIG_HOME
      ? [join(environment.XDG_CONFIG_HOME, 'pnpm/rc')]
      : []),
    ...[
      'npm_config_userconfig',
      'NPM_CONFIG_USERCONFIG',
      'npm_config_globalconfig',
      'NPM_CONFIG_GLOBALCONFIG',
    ]
      .filter((key) => environment[key])
      .map((key) => resolve(environment[key])),
  ])) {
    if (existsSync(path)) {
      if (!lstatSync(path).isFile())
        throw new PreparationError(
          'External package-manager configuration must be regular files.',
        );
      values.push([hash(path), fileIdentity(path)]);
    }
  }
  for (const name of [
    'scripts/agent-pnpm.sh',
    'scripts/agent-doctor.mjs',
    'scripts/agent-doctor-system-adapter.mjs',
  ])
    values.push([name, fileIdentity(join(root, name))]);
  for (const name of [
    'prepare-worktree.mjs',
    'worktree-inputs.mjs',
    'worktree-preparation-lock.mjs',
    'private-evidence.mjs',
    'process-group.mjs',
  ])
    values.push([
      `tool:${name}`,
      fileIdentity(fileURLToPath(new URL(name, import.meta.url))),
    ]);
  const environmentHash = hash(
    JSON.stringify(
      Object.entries(environment).sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
  return {
    paths: new Map(files.map((path) => [path, fileIdentity(path)])),
    observation: hash(JSON.stringify(values)),
    digest: hash(
      JSON.stringify({
        version: 1,
        values: values.map(([name, value]) => [
          name,
          { bytes: value.bytes, mode: value.mode },
        ]),
        environmentHash,
        configuration: hash(configuration),
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        executable: hash(readFileSync(process.execPath)),
        toolVersion,
      }),
    ),
    reusable:
      !files.some((path) => basename(path).includes('pnpmfile')) &&
      !Object.entries(config).some(
        ([key, value]) => /^(?:global-?)?pnpmfile$/iu.test(key) && value,
      ),
  };
}

export function watchPreparationInputs(root, inputs) {
  const listeners = [];
  let changed = false;
  const visit = (directory) => {
    const listener = watch(directory, (event, filename) => {
      if (!filename) {
        changed = true;
        return;
      }
      const path = join(directory, String(filename));
      if (
        relative(root, path)
          .split(sep)
          .some((part) => omitted.has(part))
      )
        return;
      if (event === 'rename') changed = true;
      else if (inputs.has(path)) {
        try {
          if (
            JSON.stringify(fileIdentity(path)) !==
            JSON.stringify(inputs.get(path))
          )
            changed = true;
        } catch {
          changed = true;
        }
      }
    });
    listener.on('error', () => {
      changed = true;
    });
    listeners.push(listener);
    for (const entry of readdirSync(directory, { withFileTypes: true }))
      if (entry.isDirectory() && !omitted.has(entry.name))
        visit(join(directory, entry.name));
  };
  try {
    visit(root);
  } catch {
    for (const listener of listeners) listener.close();
    throw new PreparationError(
      'Input observation is unavailable; preparation cannot qualify safely.',
    );
  }
  return {
    assertUnchanged: () => {
      if (changed)
        throw new PreparationError(
          'Inputs changed during preparation (filesystem observation); qualification remains incomplete.',
        );
    },
    close: () => {
      for (const listener of listeners) listener.close();
    },
  };
}

function assertOwnedHardlinks(root) {
  const identities = new Map();
  const inspect = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (['.git', '.worktrees', '.claude', '.pnpm-home'].includes(entry.name))
        continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) inspect(path);
      else if (entry.isFile()) {
        const file = lstatSync(path, { bigint: true });
        if (file.nlink > 1n) {
          const key = `${file.dev}:${file.ino}`;
          const seen = identities.get(key);
          if (seen && seen.links !== file.nlink)
            throw new PreparationError(
              'Dependency link ownership changed during inspection.',
            );
          identities.set(key, {
            links: file.nlink,
            owned: (seen?.owned ?? 0n) + 1n,
          });
        }
      }
    }
  };
  inspect(root);
  if ([...identities.values()].some((file) => file.owned !== file.links))
    throw new PreparationError(
      'Files have hardlinks outside the private worktree. Preserve this installation and prepare a fresh isolated target.',
    );
}

export function privateModules(root) {
  assertOwnedHardlinks(root);
  const metadata = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        let target;
        try {
          target = realpathSync.native(path);
        } catch {
          throw new PreparationError(
            'Broken dependency links need explicit repair.',
          );
        }
        if (!within(root, target))
          throw new PreparationError(
            'Dependency links into another installation are refused.',
          );
        metadata.push([relative(root, path), `link:${relative(root, target)}`]);
      } else if (entry.isDirectory()) visit(path);
      else if (entry.isFile())
        metadata.push([relative(root, path), hash(readFileSync(path))]);
      else
        throw new PreparationError(
          'Unsupported file type in dependency installation.',
        );
    }
  };
  const roots = [];
  const discover = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.name === 'node_modules') {
        if (!entry.isDirectory() || entry.isSymbolicLink())
          throw new PreparationError(
            'Shared node_modules roots are refused; preserve and detach them first.',
          );
        roots.push(path);
      } else if (entry.isDirectory() && !omitted.has(entry.name))
        discover(path);
    }
  };
  discover(root);
  for (const directory of roots.sort()) visit(directory);
  return {
    present: existsSync(join(root, 'node_modules/.modules.yaml')),
    digest: hash(
      JSON.stringify(metadata.sort(([a], [b]) => a.localeCompare(b))),
    ),
  };
}
