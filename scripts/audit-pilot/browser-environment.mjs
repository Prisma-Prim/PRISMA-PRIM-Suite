import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/** Playwright's Linux default must be captured before managed PostgreSQL isolates XDG caches. */
export function preservePilotBrowserInstallation(environment) {
  if (process.platform !== 'linux' || environment.PLAYWRIGHT_BROWSERS_PATH)
    return environment;
  const cache = environment.XDG_CACHE_HOME || join(homedir(), '.cache');
  return {
    ...environment,
    PLAYWRIGHT_BROWSERS_PATH: resolve(
      environment.INIT_CWD || process.cwd(),
      cache,
      'ms-playwright',
    ),
  };
}
