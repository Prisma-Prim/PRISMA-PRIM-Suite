import { createHash } from 'node:crypto';
import { containerBytes } from './pilot-evaluation/container.mjs';
import { compare } from './pilot-evaluation/compare.mjs';
import { renderReport } from './pilot-evaluation/report.mjs';
import { argumentsFrom, reportError } from './pilot-evaluation/diagnostic.mjs';
import { validateCases, validateRuns } from './pilot-evaluation/schema.mjs';
import { parseJson } from './pilot-evaluation/json.mjs';
import {
  validateCaseReferences,
  validateRunReferences,
} from './pilot-evaluation/references.mjs';
import {
  artifactBytes,
  outputPath,
  readInput,
  writeArtifacts,
} from './pilot-evaluation/files.mjs';

try {
  const args = argumentsFrom(process.argv.slice(2));
  if (args === null) {
    process.stdout
      .write(`Offline pilot evaluation of synthetic or declared observations (unverified).
Options (closed; no prompts, stdin, URLs, globs or overwrite):
  --help          Alone: show help without reading inputs or writing output.
  --cases PATH    One existing regular case/reference JSON file.
  --runs PATH     One distinct existing regular selected-runs JSON file.
  --output PATH   New direct child of an existing writable directory, outside
                  this worktree and inputs. No symlink path components.

Closed schemas (every listed key required; nullable only as specified):
  prisma-prim-pilot-cases/v1: schema, caseSetId, caseSetVersion, dataKind,
    scope {workspaceRef, companyRef}, protocol {protocolId, protocolVersion,
    task, timingRule: elapsed_preparation_including_review}, cases.
  Case: caseId, caseVersion, language (ro/ru/en/other), sourceSetId,
    sourceSetVersion, sources, reference.
  Source: sourceId, sourceVersion, sha256 (64 lowercase hex), locators.
  Reference: referenceId, referenceVersion, preparedBy, preparedAt,
    preparationEvidenceRef, fields [{fieldId, state, value}], citations.
  prisma-prim-pilot-runs/v1: schema, evaluationId, caseSetId, caseSetVersion,
    protocolId, protocolVersion, manual, assisted.
  Run: runId, mode, methodId, methodVersion, operatorRef, recordedBy,
    capturedAt, captureEvidenceRef, reviewerRef, reviewedAt, observations.
  Observation: caseId, caseVersion, sourceSetId, sourceSetVersion, referenceId,
    referenceVersion, status (completed/failed/not_run), elapsedMs, fields,
    citations. Fields contain fieldId, initial {state,value}, final (or null).
  Citation: sourceId, sourceVersion, locator. Exact tuples; no semantic judge.
  State confirmed/inferred requires nonempty text; missing/contradictory null.
  Nullable: reference citations; run reviewerRef/reviewedAt together;
    observation elapsedMs/fields/citations; observed final.

Bounds: 1048576 UTF-8 bytes per input; 12 container levels; 200 cases and
observations per run; 1..16 Sources per case; 1..32 locators per Source;
0..32 fields/citations; IDs [A-Za-z][A-Za-z0-9._-]{0,63}; Versions 1..1000000;
valid Unicode without controls, 1..256 code points (task 1..1000);
UTC YYYY-MM-DDTHH:mm:ss.sssZ; elapsedMs null or integer 0..604800000.
Duplicate keys/identities, unknown properties/versions and invalid references fail.

Outputs: result.json (prisma-prim-pilot-result/v1) and report.md, each at most
16777216 UTF-8 bytes, LF, deterministic. One exclusively created regular POSIX USTAR file, private 0600 at creation
and after descriptor verification. Complete bytes and successful descriptor closes
are required before receipt. Exactly result.json then report.md, neutral headers,
512-byte padding and two zero end blocks; total limit 33556480 bytes. Preserve old results; retry failures at a new path.
Success stdout: one prisma-prim-pilot-receipt/v2 JSON line with dataKind,
measurementBasis declared_inputs_unverified, format ustar and entries
["result.json","report.md"]. Incomplete output may remain on failure; always
retry at a fresh path. No cleanup, overwrite or extraction. Filesystem must honor
exclusive creation, stable opened-file identity and POSIX permission enforcement.
Observed checks do not guarantee arbitrary same-UID/path protection, identity
after final validation (including a later close), atomic content publication or
crash/power-loss durability.
Failure stderr: one safe prisma-prim-pilot-error/v1 JSON line, at most 2048 bytes.
Exit codes:
  0 complete artifacts, including empty/failed/unmeasured evaluations;
  2 invalid arguments, JSON, schema, bounds, duplicate or reference input;
  3 file/path/output failure; 1 unexpected internal failure.
Exit 0 is no pilot quality verdict. Timings, references and hashes are supplied
declarations: no independent measurement, source-byte authenticity check,
semantic-support verification, expert approval or AI promotion. Synthetic fixtures
are fictional mechanics, never a real pilot. No network, provider, credentials,
database, server, dependency installation or TypeScript build is needed.
Full contract: docs/product/ai-knowledge-governance-prd.md section 17.

Examples:
  node scripts/pilot-evaluation.mjs --help
  node scripts/pilot-evaluation.mjs --cases /tmp/pilot/cases.json --runs /tmp/pilot/runs.json --output /tmp/pilot/result-001.tar
`);
  } else {
    const caseInput = readInput(args['--cases'], 'cases');
    const cases = caseInput.bytes;
    const caseFile = validateCases(parseJson(cases, 'cases'));
    validateCaseReferences(caseFile);
    const runInput = readInput(args['--runs'], 'runs', caseInput);
    const runs = runInput.bytes;
    const runFile = validateRuns(parseJson(runs, 'runs'));
    validateRunReferences(caseFile, runFile);
    const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
    const result = compare(caseFile, runFile, {
      casesSha256: hash(cases),
      runsSha256: hash(runs),
    });
    const resultBytes = artifactBytes(JSON.stringify(result, null, 2) + '\n');
    const reportBytes = artifactBytes(renderReport(result));
    const bytes = containerBytes(resultBytes, reportBytes);
    const output = outputPath(args['--output'], [caseInput, runInput]);
    writeArtifacts(output, bytes);
    process.stdout.write(
      JSON.stringify({
        schema: 'prisma-prim-pilot-receipt/v2',
        dataKind: result.caseSet.dataKind,
        measurementBasis: 'declared_inputs_unverified',
        format: 'ustar',
        entries: ['result.json', 'report.md'],
      }) + '\n',
    );
  }
} catch (error) {
  reportError(error);
}
