import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseAuditPilotArguments,
  PilotUsageError,
  pilotUsage,
} from './audit-pilot/protocol.mjs';

export { parseAuditPilotArguments } from './audit-pilot/protocol.mjs';

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const options = parseAuditPilotArguments(process.argv.slice(2));
    if (options.action === 'help') {
      process.stdout.write(
        `${pilotUsage}\nA disposable, loopback-only fictional audit. Ctrl+C closes its owned session.\n`,
      );
    } else {
      const { launchAuditPilot } = await import('./audit-pilot/launch.mjs');
      process.exitCode = await launchAuditPilot(options);
    }
  } catch (error) {
    process.stderr.write(
      `${error instanceof PilotUsageError ? error.message : 'Audit pilot startup failed.'}\n`,
    );
    process.exitCode = error instanceof PilotUsageError ? 2 : 1;
  }
}
