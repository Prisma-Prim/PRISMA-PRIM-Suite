import { eligibleSources } from './contexts.mjs';
import {
  requireValue,
  keys,
  list,
  text,
  id,
  version,
  oneOf,
  refs,
  refKey,
  citations,
  fields,
  unique,
  outcomes,
} from './checks.mjs';

const input = 'bundle';
function purpose(value, path) {
  oneOf(value, ['cited-answer', 'analysis'], input, path);
}
function source(value, path) {
  keys(
    value,
    [
      'sourceId',
      'version',
      'workspaceRef',
      'companyRef',
      'language',
      'admission',
      'status',
      'title',
      'passages',
    ],
    [],
    input,
    path,
  );
  for (const field of ['sourceId', 'workspaceRef', 'companyRef'])
    id(value[field], input, path + '/' + field);
  version(value.version, input, path + '/version');
  oneOf(value.language, ['ro', 'ru', 'en', 'other'], input, path + '/language');
  oneOf(
    value.admission,
    ['synthetic-approved', 'synthetic-not-approved'],
    input,
    path + '/admission',
  );
  oneOf(value.status, ['current', 'superseded'], input, path + '/status');
  text(value.title, 256, input, path + '/title');
  list(value.passages, 32, input, path + '/passages', 1);
  value.passages.forEach((passage, index) => {
    const at = `${path}/passages/${index}`;
    keys(passage, ['locator', 'text'], [], input, at);
    text(passage.locator, 256, input, at + '/locator');
    text(passage.text, 16000, input, at + '/text');
  });
  unique(value.passages, (item) => item.locator, input, path + '/passages');
}
function profile(value, path) {
  keys(
    value,
    ['profileId', 'workspaceRef', 'companyRef', 'purposes', 'permittedSources'],
    [],
    input,
    path,
  );
  for (const field of ['profileId', 'workspaceRef', 'companyRef'])
    id(value[field], input, path + '/' + field);
  list(value.purposes, 2, input, path + '/purposes');
  value.purposes.forEach((item, index) =>
    purpose(item, `${path}/purposes/${index}`),
  );
  unique(value.purposes, (item) => item, input, path + '/purposes');
  refs(value.permittedSources, input, path + '/permittedSources', 128);
}
function humanEvent(value, path) {
  requireValue(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    input,
    path,
  );
  oneOf(value.kind, ['accept', 'correct', 'reject'], input, path + '/kind');
  const required = [
    'eventRef',
    'actorRef',
    'kind',
    'fieldId',
    'at',
    'evidenceKind',
    ...(value.kind === 'reject' ? ['reason'] : ['value']),
    ...(value.kind === 'correct' ? ['reason'] : []),
  ];
  keys(value, required, [], input, path);
  for (const key of ['eventRef', 'actorRef', 'fieldId'])
    id(value[key], input, path + '/' + key);
  requireValue(
    value.evidenceKind === 'authored_fiction',
    input,
    path + '/evidenceKind',
  );
  requireValue(
    typeof value.at === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value.at) &&
      Number.isFinite(Date.parse(value.at)) &&
      new Date(value.at).toISOString().replace('.000Z', 'Z') === value.at,
    input,
    path + '/at',
  );
  if (value.kind !== 'reject') text(value.value, 1000, input, path + '/value');
  if (value.kind !== 'accept')
    text(value.reason, 2000, input, path + '/reason');
}
function expected(value, path) {
  keys(
    value,
    [
      'outcome',
      'retrievalRefs',
      'citations',
      'requiredProperties',
      'prohibitedOutcomes',
    ],
    ['fields', 'initialFields', 'finalFields'],
    input,
    path,
  );
  oneOf(value.outcome, outcomes, input, path + '/outcome');
  refs(value.retrievalRefs, input, path + '/retrievalRefs');
  citations(value.citations, input, path + '/citations');
  for (const key of ['requiredProperties', 'prohibitedOutcomes']) {
    list(value[key], 32, input, path + '/' + key);
    value[key].forEach((item, index) =>
      text(item, 2000, input, `${path}/${key}/${index}`),
    );
  }
  if (Object.hasOwn(value, 'fields'))
    fields(value.fields, input, path + '/fields');
  if (
    Object.hasOwn(value, 'initialFields') ||
    Object.hasOwn(value, 'finalFields')
  ) {
    requireValue(
      !Object.hasOwn(value, 'fields') &&
        Object.hasOwn(value, 'initialFields') &&
        Object.hasOwn(value, 'finalFields'),
      input,
      path,
    );
    fields(value.initialFields, input, path + '/initialFields');
    fields(value.finalFields, input, path + '/finalFields');
  }
}
function caseValue(value, path) {
  keys(
    value,
    [
      'caseId',
      'caseVersion',
      'language',
      'purpose',
      'profileId',
      'mode',
      'question',
      'candidateRefs',
      'expected',
    ],
    ['selectedHistoricalRefs', 'humanDisposition'],
    input,
    path,
  );
  id(value.caseId, input, path + '/caseId');
  version(value.caseVersion, input, path + '/caseVersion');
  oneOf(value.language, ['ro', 'ru', 'en', 'other'], input, path + '/language');
  purpose(value.purpose, path + '/purpose');
  id(value.profileId, input, path + '/profileId');
  oneOf(value.mode, ['current', 'historical'], input, path + '/mode');
  text(value.question, 2000, input, path + '/question');
  refs(value.candidateRefs, input, path + '/candidateRefs');
  expected(value.expected, path + '/expected');
  if (value.mode === 'historical') {
    refs(value.selectedHistoricalRefs, input, path + '/selectedHistoricalRefs');
    requireValue(
      value.selectedHistoricalRefs.length > 0,
      input,
      path + '/selectedHistoricalRefs',
    );
  } else
    requireValue(!Object.hasOwn(value, 'selectedHistoricalRefs'), input, path);
  if (Object.hasOwn(value, 'humanDisposition')) {
    humanEvent(value.humanDisposition, path + '/humanDisposition');
    requireValue(
      value.purpose === 'analysis' &&
        Object.hasOwn(value.expected, 'initialFields'),
      input,
      path,
    );
    const names = {
      accept: 'human_accepted',
      correct: 'human_corrected',
      reject: 'human_rejected',
    };
    requireValue(
      value.expected.outcome === names[value.humanDisposition.kind],
      input,
      path + '/expected/outcome',
    );
  } else
    requireValue(
      !Object.hasOwn(value.expected, 'initialFields') &&
        !['human_accepted', 'human_corrected', 'human_rejected'].includes(
          value.expected.outcome,
        ),
      input,
      path + '/expected',
    );
  const initial = value.expected.fields ?? value.expected.initialFields ?? [];
  requireValue(
    initial.every((field) => field.state !== 'confirmed'),
    input,
    path + '/expected',
    'E_REFERENCE',
  );
}

export function validateBundle(value) {
  keys(value, ['schema', 'content', 'expectations'], [], input, '');
  requireValue(
    value.schema === 'prisma-prim-knowledge-bundle/v1',
    input,
    '/schema',
  );
  const content = value.content,
    oracle = value.expectations;
  keys(
    content,
    ['format', 'corpusId', 'corpusVersion', 'dataKind', 'profiles', 'sources'],
    [],
    input,
    '/content',
  );
  requireValue(
    content.format === 'prisma-prim-synthetic-knowledge-content/v1' &&
      content.dataKind === 'synthetic',
    input,
    '/content',
  );
  id(content.corpusId, input, '/content/corpusId');
  version(content.corpusVersion, input, '/content/corpusVersion');
  list(content.profiles, 32, input, '/content/profiles', 1);
  content.profiles.forEach((item, index) =>
    profile(item, `/content/profiles/${index}`),
  );
  unique(
    content.profiles,
    (item) => item.profileId,
    input,
    '/content/profiles',
  );
  list(content.sources, 128, input, '/content/sources');
  content.sources.forEach((item, index) =>
    source(item, `/content/sources/${index}`),
  );
  unique(content.sources, refKey, input, '/content/sources');
  const bySource = new Map(content.sources.map((item) => [refKey(item), item]));
  for (const item of content.profiles)
    for (const ref of item.permittedSources)
      requireValue(
        bySource.has(refKey(ref)),
        input,
        '/content/profiles',
        'E_REFERENCE',
      );
  const sourceIds = new Map();
  for (const item of content.sources) {
    const old = sourceIds.get(item.sourceId);
    if (old)
      requireValue(
        old.workspaceRef === item.workspaceRef &&
          old.companyRef === item.companyRef &&
          !(old.current && item.status === 'current'),
        input,
        '/content/sources',
        'E_REFERENCE',
      );
    sourceIds.set(item.sourceId, {
      workspaceRef: item.workspaceRef,
      companyRef: item.companyRef,
      current: old?.current || item.status === 'current',
    });
  }
  keys(
    oracle,
    [
      'format',
      'corpusId',
      'corpusVersion',
      'expectationSetId',
      'expectationSetVersion',
      'dataKind',
      'cases',
    ],
    [],
    input,
    '/expectations',
  );
  requireValue(
    oracle.format === 'prisma-prim-synthetic-knowledge-expectations/v1' &&
      oracle.dataKind === 'synthetic',
    input,
    '/expectations',
  );
  id(oracle.corpusId, input, '/expectations/corpusId');
  version(oracle.corpusVersion, input, '/expectations/corpusVersion');
  id(oracle.expectationSetId, input, '/expectations/expectationSetId');
  version(
    oracle.expectationSetVersion,
    input,
    '/expectations/expectationSetVersion',
  );
  requireValue(
    oracle.corpusId === content.corpusId &&
      oracle.corpusVersion === content.corpusVersion,
    input,
    '/expectations',
    'E_REFERENCE',
  );
  list(oracle.cases, 200, input, '/expectations/cases');
  oracle.cases.forEach((item, index) =>
    caseValue(item, `/expectations/cases/${index}`),
  );
  unique(oracle.cases, (item) => item.caseId, input, '/expectations/cases');
  oracle.cases.forEach((item, index) => {
    const path = `/expectations/cases/${index}`;
    requireValue(
      content.profiles.some((profile) => profile.profileId === item.profileId),
      input,
      path + '/profileId',
      'E_REFERENCE',
    );
    for (const ref of item.candidateRefs)
      requireValue(
        bySource.has(refKey(ref)),
        input,
        path + '/candidateRefs',
        'E_REFERENCE',
      );
    for (const ref of item.selectedHistoricalRefs ?? [])
      requireValue(
        item.candidateRefs.some(
          (candidate) => refKey(ref) === refKey(candidate),
        ),
        input,
        path + '/selectedHistoricalRefs',
        'E_REFERENCE',
      );
    const eligible = new Set(eligibleSources(value, item).map(refKey));
    requireValue(
      item.expected.retrievalRefs.every((ref) => eligible.has(refKey(ref))),
      input,
      path + '/expected/retrievalRefs',
      'E_REFERENCE',
    );
    for (const citation of item.expected.citations) {
      const owner = bySource.get(refKey(citation));
      requireValue(
        eligible.has(refKey(citation)) &&
          item.expected.retrievalRefs.some(
            (ref) => refKey(ref) === refKey(citation),
          ) &&
          owner?.passages.some(
            (passage) =>
              passage.locator === citation.locator &&
              passage.text === citation.quote,
          ),
        input,
        path + '/expected/citations',
        'E_REFERENCE',
      );
    }
    if (item.humanDisposition) {
      const event = item.humanDisposition,
        final = item.expected.finalFields;
      const initial = item.expected.initialFields.find(
        (field) => field.fieldId === event.fieldId,
      );
      requireValue(
        initial !== undefined &&
          (event.kind !== 'accept' || initial.value === event.value),
        input,
        path + '/expected/initialFields',
        'E_REFERENCE',
      );
      requireValue(
        event.kind === 'reject'
          ? final.length === 0
          : final.length === 1 &&
              final[0].fieldId === event.fieldId &&
              final[0].state === 'confirmed' &&
              final[0].value === event.value,
        input,
        path + '/expected/finalFields',
        'E_REFERENCE',
      );
    }
  });
  const events = oracle.cases.flatMap((item) =>
    item.humanDisposition ? [item.humanDisposition] : [],
  );
  unique(events, (item) => item.eventRef, input, '/expectations/cases');
  return value;
}
