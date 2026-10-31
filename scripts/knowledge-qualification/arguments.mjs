import { fail, EvaluationError } from '../pilot-evaluation/diagnostic.mjs';

export const examples = {
  prepare:
    'node scripts/knowledge-qualification.mjs prepare --bundle /tmp/knowledge/bundle.json --out /tmp/knowledge/contexts-001.tar',
  evaluate:
    'node scripts/knowledge-qualification.mjs evaluate --bundle /tmp/knowledge/bundle.json --observations /tmp/knowledge/observations.json --out /tmp/knowledge/result-001.tar',
};

export function argumentsFrom(argv) {
  if (argv.length === 1 && argv[0] === '--help') return { mode: 'help' };
  const mode = argv[0];
  if (!['prepare', 'evaluate'].includes(mode))
    fail(
      'E_ARGUMENT',
      'arguments',
      null,
      'Select prepare or evaluate; use --help for examples.',
    );
  if (argv.length === 2 && argv[1] === '--help')
    return { mode: 'help', topic: mode };
  const required =
    mode === 'prepare'
      ? ['--bundle', '--out']
      : ['--bundle', '--observations', '--out'];
  const values = {};
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index],
      value = argv[index + 1];
    if (
      !required.includes(flag) ||
      Object.hasOwn(values, flag) ||
      typeof value !== 'string' ||
      value.length === 0 ||
      value === '-' ||
      value.startsWith('--') ||
      /[*?[\]{}]/u.test(value) ||
      /^[a-z][a-z0-9+.-]*:/i.test(value) ||
      Array.from(value).some(
        (character) =>
          character.codePointAt(0) < 32 || character.codePointAt(0) === 127,
      )
    )
      fail(
        'E_ARGUMENT',
        'arguments',
        null,
        'Use each required flag exactly once with one nonempty local file path.',
      );
    values[flag] = value;
  }
  if (Object.keys(values).length !== required.length)
    fail(
      'E_ARGUMENT',
      'arguments',
      null,
      'Supply all mode-specific flags, or use mode --help alone.',
    );
  return { mode, values };
}

export function help(topic) {
  const modes = topic ? [topic] : ['prepare', 'evaluate'];
  return `Offline synthetic source-context and exact-citation qualification.\nNo AI/provider, network, database, business mutation or real access grant.\n\nExamples:\n${modes.map((mode) => `${mode}: ${mode === 'prepare' ? 'prepare candidate-safe source contexts without the operator oracle' : 'compare separately captured declared observations to the operator oracle'}\n  ${examples[mode]}\n`).join('\n')}\nUse --help alone or prepare/evaluate --help. Flags are closed; no prompts, stdin, URLs, globs or overwrite.\nInputs: existing distinct regular UTF-8 JSON files, <=1048576 bytes each, depth<=12; duplicate keys and unknown properties/versions fail.\nOutput: one fresh private0600 regular USTAR file outside this worktree/inputs, result.json then report.md, each<=16777216 bytes. No symlink components.\nA successful receipt requires complete verified bytes and descriptor closes. Incomplete output may remain after failure; preserve it and retry at a new path.\nExit0 means complete mechanical output, including findings or unavailable measures; not AI quality, semantic support, representative evaluation or real admission/approval. Exit2 invalid arguments/input, exit3 file/output failure, exit1 unexpected internal failure.\nContract and complete schemas: docs/product/ai-knowledge-governance-prd.md section18.\n`;
}

export function reportError(error) {
  const known = error instanceof EvaluationError;
  const code = known ? error.code : 'E_INTERNAL';
  const repair = {
    E_ARGUMENT: 'Use one mode and its complete closed flags, or --help alone.',
    E_INPUT_FILE:
      'Choose existing distinct regular readable input files without symlink components.',
    E_INPUT_LIMIT:
      'Keep each input within1048576 UTF-8 bytes and12 JSON container levels.',
    E_JSON: 'Use valid UTF-8 JSON without BOM or duplicate object keys.',
    E_SCHEMA: 'Use the exact documented schema, fields and bounded values.',
    E_DUPLICATE: 'Keep object keys and declared identities unique.',
    E_REFERENCE:
      'Use compatible declared corpus, case, profile, purpose, mode and version identities.',
    E_OUTPUT_PATH:
      'Choose a fresh direct child of an existing writable directory, outside this worktree and inputs, without symlink components.',
    E_OUTPUT_EXISTS:
      'Preserve the existing output and select a fresh output path.',
    E_OUTPUT_LIMIT:
      'Reduce the complete payload within the documented output bounds; do not truncate records.',
    E_OUTPUT_WRITE:
      'Incomplete output may remain. Preserve it and restore writable storage; retry at a fresh path.',
    E_INTERNAL:
      'Qualification could not complete; retry with minimized synthetic inputs and a fresh output path.',
  };
  process.stderr.write(
    JSON.stringify({
      schema: 'prisma-prim-knowledge-error/v1',
      code,
      input: known ? error.input : 'internal',
      location: known ? error.location : null,
      message: repair[code] ?? repair.E_INTERNAL,
      example: examples.evaluate,
    }) + '\n',
  );
  process.exitCode =
    code === 'E_INTERNAL'
      ? 1
      : [
            'E_INPUT_FILE',
            'E_OUTPUT_PATH',
            'E_OUTPUT_EXISTS',
            'E_OUTPUT_LIMIT',
            'E_OUTPUT_WRITE',
          ].includes(code)
        ? 3
        : 2;
}
