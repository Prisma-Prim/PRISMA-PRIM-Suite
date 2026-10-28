import { fail } from './diagnostic.mjs';

function invalid(input, location, message) {
  fail('E_SCHEMA', input, location, message);
}

function text(value, input, location, maximum = 256) {
  const characters = typeof value === 'string' ? Array.from(value) : [];
  if (
    typeof value !== 'string' ||
    !value.isWellFormed() ||
    characters.some(
      (character) =>
        character.codePointAt(0) < 32 || character.codePointAt(0) === 127,
    ) ||
    characters.length === 0 ||
    characters.length > maximum
  )
    invalid(
      input,
      location,
      `Use nonempty valid Unicode text without control characters, at most ${maximum} code points.`,
    );
  return value;
}

function id(value, input, location) {
  text(value, input, location);
  if (!/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(value))
    invalid(
      input,
      location,
      'Use an ASCII letter followed by at most 63 ASCII letters, digits, dots, underscores or hyphens.',
    );
  return value;
}

function integer(value, input, location, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    invalid(input, location, `Use an integer from ${minimum} to ${maximum}.`);
  return value;
}

const version = (value, input, location) =>
  integer(value, input, location, 1, 1000000);
const nullable = (reader) => (value, input, location) =>
  value === null ? null : reader(value, input, location);
const choice =
  (...values) =>
  (value, input, location) => {
    if (!values.includes(value))
      invalid(input, location, `Use a supported value: ${values.join(', ')}.`);
    return value;
  };

function utc(value, input, location) {
  text(value, input, location);
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    invalid(
      input,
      location,
      'Use a real UTC calendar instant in YYYY-MM-DDTHH:mm:ss.sssZ form.',
    );
  return value;
}

function object(value, input, location, readers) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    invalid(input, location, 'Use the required closed JSON object.');
  const result = {};
  for (const [key, reader] of Object.entries(readers)) {
    if (!Object.hasOwn(value, key))
      invalid(
        input,
        `${location}/${key}`,
        'Supply this required property, including null only where allowed.',
      );
    result[key] = reader(value[key], input, `${location}/${key}`);
  }
  if (Object.keys(value).some((key) => !Object.hasOwn(readers, key)))
    invalid(
      input,
      location,
      'Remove unrecognized properties from this object.',
    );
  return result;
}

const array = (minimum, maximum, reader) => (value, input, location) => {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum)
    invalid(
      input,
      location,
      `Use an array with ${minimum} to ${maximum} entries.`,
    );
  return value.map((entry, index) =>
    reader(entry, input, `${location}/${index}`),
  );
};

function valuePair(value, input, location, field = false) {
  const result = object(value, input, location, {
    ...(field ? { fieldId: id } : {}),
    state: choice('confirmed', 'inferred', 'missing', 'contradictory'),
    value: nullable(text),
  });
  if (
    (result.state === 'confirmed' || result.state === 'inferred') ===
    (result.value === null)
  )
    invalid(
      input,
      `${location}/value`,
      'Confirmed/inferred require nonempty text; missing/contradictory require null.',
    );
  return result;
}

function citation(value, input, location) {
  return object(value, input, location, {
    sourceId: id,
    sourceVersion: version,
    locator: text,
  });
}

function source(value, input, location) {
  return object(value, input, location, {
    sourceId: id,
    sourceVersion: version,
    sha256: (value, input, location) => {
      if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
        invalid(
          input,
          location,
          'Use exactly 64 lowercase hexadecimal SHA-256 characters.',
        );
      return value;
    },
    locators: array(1, 32, text),
  });
}

function reference(value, input, location) {
  return object(value, input, location, {
    referenceId: id,
    referenceVersion: version,
    preparedBy: id,
    preparedAt: utc,
    preparationEvidenceRef: text,
    fields: array(0, 32, (value, input, location) =>
      valuePair(value, input, location, true),
    ),
    citations: nullable(array(0, 32, citation)),
  });
}

function declaredCase(value, input, location) {
  return object(value, input, location, {
    caseId: id,
    caseVersion: version,
    language: choice('ro', 'ru', 'en', 'other'),
    sourceSetId: id,
    sourceSetVersion: version,
    sources: array(1, 16, source),
    reference,
  });
}

export function validateCases(value) {
  return object(value, 'cases', '', {
    schema: choice('prisma-prim-pilot-cases/v1'),
    caseSetId: id,
    caseSetVersion: version,
    dataKind: choice('synthetic', 'anonymized_declared'),
    scope: (value, input, location) =>
      object(value, input, location, { workspaceRef: id, companyRef: id }),
    protocol: (value, input, location) =>
      object(value, input, location, {
        protocolId: id,
        protocolVersion: version,
        task: (value, input, location) => text(value, input, location, 1000),
        timingRule: choice('elapsed_preparation_including_review'),
      }),
    cases: array(0, 200, declaredCase),
  });
}

function elapsed(value, input, location) {
  if (
    value !== null &&
    (!Number.isInteger(value) || value < 0 || value > 604800000)
  )
    invalid(
      input,
      location,
      'Use null or an integer from 0 to 604800000 milliseconds.',
    );
  return value;
}

function observedField(value, input, location) {
  return object(value, input, location, {
    fieldId: id,
    initial: valuePair,
    final: nullable(valuePair),
  });
}

function observation(value, input, location) {
  const result = object(value, input, location, {
    caseId: id,
    caseVersion: version,
    sourceSetId: id,
    sourceSetVersion: version,
    referenceId: id,
    referenceVersion: version,
    status: choice('completed', 'failed', 'not_run'),
    elapsedMs: elapsed,
    fields: nullable(array(0, 32, observedField)),
    citations: nullable(array(0, 32, citation)),
  });
  if (result.status === 'not_run' && result.elapsedMs !== null)
    invalid(
      input,
      `${location}/elapsedMs`,
      'A not_run observation requires null time.',
    );
  for (const key of ['fields', 'citations'])
    if (result.status !== 'completed' && result[key] !== null)
      invalid(
        input,
        `${location}/${key}`,
        'Failed and not_run observations require null fields and citations.',
      );
  return result;
}

function run(value, input, location, mode) {
  const result = object(value, input, location, {
    runId: id,
    mode: choice(mode),
    methodId: id,
    methodVersion: version,
    operatorRef: id,
    recordedBy: id,
    capturedAt: utc,
    captureEvidenceRef: text,
    reviewerRef: nullable(id),
    reviewedAt: nullable(utc),
    observations: array(0, 200, observation),
  });
  if (
    (result.reviewerRef === null) !== (result.reviewedAt === null) ||
    (result.reviewerRef === null &&
      result.observations.some((o) => o.fields?.some((f) => f.final !== null)))
  )
    invalid(
      input,
      `${location}/reviewerRef`,
      'Supply reviewerRef and reviewedAt together when any final value is declared; otherwise both may be null.',
    );
  return result;
}

export function validateRuns(value) {
  return object(value, 'runs', '', {
    schema: choice('prisma-prim-pilot-runs/v1'),
    evaluationId: id,
    caseSetId: id,
    caseSetVersion: version,
    protocolId: id,
    protocolVersion: version,
    manual: (value, input, location) => run(value, input, location, 'manual'),
    assisted: (value, input, location) =>
      run(value, input, location, 'assisted'),
  });
}
