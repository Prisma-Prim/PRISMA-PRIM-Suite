import { fail } from './diagnostic.mjs';

const sourceKey = (s) => JSON.stringify([s.sourceId, s.sourceVersion]);
const citationKey = (c) =>
  JSON.stringify([c.sourceId, c.sourceVersion, c.locator]);

function unique(set, key, input, location) {
  if (set.has(key))
    fail(
      'E_DUPLICATE',
      input,
      location,
      'Remove the duplicate identity or tuple; select each item only once.',
    );
  set.add(key);
}

function referenceFailure(input, location) {
  fail(
    'E_REFERENCE',
    input,
    location,
    'Use the exact declared identity and inventory; correct the input explicitly without repairing observations implicitly.',
  );
}

function uniqueCitations(citations, input, location) {
  const seen = new Set();
  citations?.forEach((c, i) =>
    unique(seen, citationKey(c), input, `${location}/${i}`),
  );
}

export function validateCaseReferences(file) {
  const caseIds = new Set();
  const sourceSets = new Set();
  const references = new Set();
  const inventory = new Map();
  file.cases.forEach((c, i) => {
    const location = `/cases/${i}`;
    unique(caseIds, c.caseId, 'cases', `${location}/caseId`);
    unique(sourceSets, c.sourceSetId, 'cases', `${location}/sourceSetId`);
    const caseSources = new Set();
    const tuples = new Set();
    c.sources.forEach((source, j) => {
      const at = `${location}/sources/${j}`;
      const key = sourceKey(source);
      unique(caseSources, key, 'cases', at);
      const locators = new Set();
      source.locators.forEach((locator, k) => {
        unique(locators, locator, 'cases', `${at}/locators/${k}`);
        tuples.add(citationKey({ ...source, locator }));
      });
      const signature = JSON.stringify([source.sha256, [...locators].sort()]);
      if (inventory.has(key) && inventory.get(key) !== signature)
        referenceFailure('cases', at);
      inventory.set(key, signature);
    });
    unique(
      references,
      c.reference.referenceId,
      'cases',
      `${location}/reference/referenceId`,
    );
    const fieldIds = new Set();
    c.reference.fields.forEach((field, j) =>
      unique(
        fieldIds,
        field.fieldId,
        'cases',
        `${location}/reference/fields/${j}/fieldId`,
      ),
    );
    const citationIds = new Set();
    c.reference.citations?.forEach((citation, j) => {
      unique(
        citationIds,
        citationKey(citation),
        'cases',
        `${location}/reference/citations/${j}`,
      );
      if (!tuples.has(citationKey(citation)))
        referenceFailure('cases', `${location}/reference/citations/${j}`);
    });
  });
}

export function validateRunReferences(cases, runs) {
  for (const [key, expected] of [
    ['caseSetId', cases.caseSetId],
    ['caseSetVersion', cases.caseSetVersion],
    ['protocolId', cases.protocol.protocolId],
    ['protocolVersion', cases.protocol.protocolVersion],
  ])
    if (runs[key] !== expected) referenceFailure('runs', `/${key}`);
  const declared = new Map(cases.cases.map((c) => [c.caseId, c]));
  const runIds = new Set();
  for (const name of ['manual', 'assisted']) {
    const run = runs[name];
    unique(runIds, run.runId, 'runs', `/${name}/runId`);
    const observedCases = new Set();
    run.observations.forEach((observation, i) => {
      const location = `/${name}/observations/${i}`;
      unique(observedCases, observation.caseId, 'runs', `${location}/caseId`);
      const c = declared.get(observation.caseId);
      if (!c) referenceFailure('runs', `${location}/caseId`);
      const compatible =
        observation.caseVersion === c.caseVersion &&
        observation.sourceSetId === c.sourceSetId &&
        observation.sourceSetVersion === c.sourceSetVersion &&
        observation.referenceId === c.reference.referenceId &&
        observation.referenceVersion === c.reference.referenceVersion;
      const referenceFields = new Set(c.reference.fields.map((f) => f.fieldId));
      const fieldIds = new Set();
      observation.fields?.forEach((field, j) => {
        unique(
          fieldIds,
          field.fieldId,
          'runs',
          `${location}/fields/${j}/fieldId`,
        );
        if (compatible && !referenceFields.has(field.fieldId))
          referenceFailure('runs', `${location}/fields/${j}/fieldId`);
      });
      uniqueCitations(observation.citations, 'runs', `${location}/citations`);
    });
  }
}
