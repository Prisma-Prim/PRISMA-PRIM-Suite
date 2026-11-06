import { spawnSync } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const lifecycleScripts = [
  'codex-cloud-setup.sh',
  'codex-cloud-maintenance.sh',
  'codex-cloud-start.sh',
];

// The pnpm wrapper and the PostgreSQL installer only record their arguments,
// so the real lifecycle scripts run without Node, network or a cluster.
const pnpmStub = String.raw`
printf 'pnpm %s\n' "$*" >>"$CALL_LOG"
case "$1" in
  --version) echo 11.20.0 ;;
  install) mkdir -p node_modules ;;
  exec)
    printf 'doctor-target [%s]\n' "$TEST_DATABASE_URL" >>"$CALL_LOG"
    exit "$DOCTOR_STATUS" ;;
esac
`;
const postgresStub = String.raw`
printf 'postgres %s\n' "$*" >>"$CALL_LOG"
if [[ "$1" != --stop ]]; then
  mkdir -p "$HOME/.config/prisma-prim"
  echo 'export TEST_DATABASE_URL=stub_test' >"$HOME/.config/prisma-prim/postgres-runtime.sh"
fi
`;

export async function runCloudScript(
  script,
  args = [],
  { doctorStatus = 0, preparedNodeRuntime = true } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'codex-cloud-'));
  try {
    const checkout = join(root, 'checkout');
    const home = join(root, 'home');
    const callLog = join(root, 'calls.log');
    await mkdir(join(checkout, 'scripts'), { recursive: true });
    await mkdir(join(home, '.nvm'), { recursive: true });
    for (const name of lifecycleScripts) {
      await copyFile(
        new URL(name, import.meta.url),
        join(checkout, 'scripts', name),
      );
    }
    await writeFile(join(checkout, 'scripts', 'agent-pnpm.sh'), pnpmStub);
    await writeFile(
      join(checkout, 'scripts', 'codex-cloud-postgres.sh'),
      postgresStub,
    );
    await writeFile(
      join(checkout, '.node-version'),
      `${process.versions.node.split('.')[0]}\n`,
    );
    await writeFile(
      join(checkout, 'package.json'),
      '{ "packageManager": "pnpm@11.20.0" }\n',
    );
    await writeFile(
      join(home, '.nvm', 'nvm.sh'),
      'nvm() { [[ "$1" != version ]] || echo installed; }\n',
    );
    if (preparedNodeRuntime) {
      await mkdir(join(home, '.config', 'prisma-prim'), { recursive: true });
      await writeFile(
        join(home, '.config', 'prisma-prim', 'node-runtime.sh'),
        ':\n',
      );
    }
    await writeFile(callLog, '');
    for (const command of [
      ['init', '-q'],
      ['add', 'package.json'],
    ]) {
      const git = spawnSync('git', command, { cwd: checkout });
      if (git.status !== 0) throw new Error(`git ${command[0]} failed`);
    }

    const result = spawnSync(
      'bash',
      [join(checkout, 'scripts', script), ...args],
      {
        encoding: 'utf8',
        timeout: 30_000,
        env: {
          ...process.env,
          HOME: home,
          NVM_DIR: join(home, '.nvm'),
          CALL_LOG: callLog,
          DOCTOR_STATUS: String(doctorStatus),
          TEST_DATABASE_URL: '',
        },
      },
    );
    if (result.error) throw result.error;
    const calls = (await readFile(callLog, 'utf8')).split('\n').filter(Boolean);
    return { status: result.status, stderr: result.stderr, calls };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
