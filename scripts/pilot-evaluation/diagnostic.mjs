export const example =
  'node scripts/pilot-evaluation.mjs --cases /tmp/pilot/cases.json --runs /tmp/pilot/runs.json --output /tmp/pilot/result-001';

export class EvaluationError extends Error {
  constructor(code, input, location, message) {
    super(message);
    this.code = code;
    this.input = input;
    this.location = location;
  }
}

export function fail(code, input, location, message) {
  throw new EvaluationError(code, input, location, message);
}

export function reportError(error) {
  const value =
    error instanceof EvaluationError
      ? error
      : new EvaluationError(
          'E_INTERNAL',
          'internal',
          null,
          'Evaluation could not complete. Retry with minimized inputs and a new output path.',
        );
  process.stderr.write(
    JSON.stringify({
      schema: 'prisma-prim-pilot-error/v1',
      code: value.code,
      input: value.input,
      location: value.location,
      message: `${value.message} Declared inputs are unverified; no pilot verdict.`,
      example,
    }) + '\n',
  );
  process.exitCode =
    value.code === 'E_INTERNAL'
      ? 1
      : [
            'E_INPUT_FILE',
            'E_OUTPUT_PATH',
            'E_OUTPUT_EXISTS',
            'E_OUTPUT_LIMIT',
            'E_OUTPUT_WRITE',
          ].includes(value.code)
        ? 3
        : 2;
}

export function argumentsFrom(argv) {
  if (argv.length === 1 && argv[0] === '--help') return null;
  const selected = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (
      !['--cases', '--runs', '--output'].includes(flag) ||
      Object.hasOwn(selected, flag) ||
      typeof value !== 'string' ||
      value.length === 0 ||
      value.startsWith('--') ||
      value === '-' ||
      /[*?[\]{}]/u.test(value) ||
      Array.from(value).some(
        (character) =>
          character.codePointAt(0) < 32 || character.codePointAt(0) === 127,
      ) ||
      /^[a-z][a-z0-9+.-]*:/i.test(value)
    )
      fail(
        'E_ARGUMENT',
        'arguments',
        null,
        'Use exactly --cases, --runs and --output with one local path each, or --help alone.',
      );
    selected[flag] = value;
  }
  if (Object.keys(selected).length !== 3)
    fail(
      'E_ARGUMENT',
      'arguments',
      null,
      'Supply all three required local paths, or use --help alone.',
    );
  return selected;
}
