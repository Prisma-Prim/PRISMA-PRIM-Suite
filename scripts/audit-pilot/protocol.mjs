export const pilotUsage = 'Usage: pnpm pilot:audit [--check | --help]';

export class PilotUsageError extends Error {}

export function parseAuditPilotArguments(args) {
  if (args.length === 0) return { action: 'run' };
  if (args.length === 1 && args[0] === '--help') return { action: 'help' };
  if (args.length === 1 && args[0] === '--check') return { action: 'check' };
  const flag = args[0]?.split('=')[0];
  throw new PilotUsageError(
    /^--[a-z][a-z-]{0,40}$/u.test(flag ?? '')
      ? `Unknown argument ${flag}. ${pilotUsage}`
      : pilotUsage,
  );
}
