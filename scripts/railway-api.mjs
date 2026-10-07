import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { apiEnvironment, databaseUrl } from './railway-config.mjs';

try {
  const action = process.argv[2];
  if (action === 'start') {
    Object.assign(process.env, apiEnvironment(process.env));
    await import('../apps/api/dist/main.js');
  } else if (action === 'migrate') {
    databaseUrl(process.env);
    const apiDirectory = fileURLToPath(
      new URL('../apps/api/', import.meta.url),
    );
    const child = spawn(
      process.execPath,
      ['node_modules/drizzle-kit/bin.cjs', 'migrate'],
      {
        cwd: apiDirectory,
        env: { ...process.env, NODE_ENV: 'production' },
        stdio: 'inherit',
      },
    );
    for (const signal of ['SIGTERM', 'SIGINT'])
      process.on(signal, () => child.kill(signal));
    child.on('error', () => {
      console.error('Unable to launch the existing Drizzle migration command.');
      process.exitCode = 1;
    });
    child.on('exit', (code) => {
      process.exitCode = code ?? 1;
    });
  } else {
    throw new Error('Expected start or migrate.');
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Invalid configuration.',
  );
  process.exitCode = 1;
}
