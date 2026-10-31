import { createHash } from 'node:crypto';
import { parseJson } from './pilot-evaluation/json.mjs';
import {
  readInput,
  outputPath,
  writeArtifacts,
  artifactBytes,
} from './pilot-evaluation/files.mjs';
import { containerBytes } from './pilot-evaluation/container.mjs';
import {
  argumentsFrom,
  help,
  reportError,
} from './knowledge-qualification/arguments.mjs';
import { prepare, contextReport } from './knowledge-qualification/contexts.mjs';
import { validateBundle } from './knowledge-qualification/bundle.mjs';
import { validateObservations } from './knowledge-qualification/observations.mjs';
import {
  evaluate,
  evaluationReport,
} from './knowledge-qualification/evaluate.mjs';

try {
  const args = argumentsFrom(process.argv.slice(2));
  if (args.mode === 'help') process.stdout.write(help(args.topic));
  else {
    const bundleInput = readInput(args.values['--bundle'], 'bundle');
    const bundle = validateBundle(parseJson(bundleInput.bytes, 'bundle'));
    let result, report;
    const inputs = [bundleInput];
    if (args.mode === 'prepare') {
      result = prepare(bundle);
      report = contextReport(result);
    } else {
      const observationInput = readInput(
        args.values['--observations'],
        'observations',
        bundleInput,
      );
      inputs.push(observationInput);
      const run = validateObservations(
        parseJson(observationInput.bytes, 'observations'),
        bundle,
      );
      const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
      result = evaluate(bundle, run, {
        bundle: hash(bundleInput.bytes),
        observations: hash(observationInput.bytes),
      });
      report = evaluationReport(result);
    }
    const bytes = containerBytes(
      artifactBytes(JSON.stringify(result, null, 2) + '\n'),
      artifactBytes(report),
    );
    writeArtifacts(outputPath(args.values['--out'], inputs), bytes);
    process.stdout.write(
      JSON.stringify({
        schema: 'prisma-prim-knowledge-receipt/v1',
        mode: args.mode,
        dataKind: 'synthetic',
        measurementBasis: 'declared_inputs_unverified',
        format: 'ustar',
        entries: ['result.json', 'report.md'],
      }) + '\n',
    );
  }
} catch (error) {
  reportError(error);
}
