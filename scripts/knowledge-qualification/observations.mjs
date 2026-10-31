import {
  requireValue,
  keys,
  list,
  text,
  id,
  version,
  oneOf,
  refs,
  citations,
  fields,
  unique,
  outcomes,
} from './checks.mjs';

export function validateObservations(value, bundle) {
  const input = 'observations';
  keys(
    value,
    [
      'schema',
      'dataKind',
      'corpusId',
      'corpusVersion',
      'expectationSetId',
      'expectationSetVersion',
      'runId',
      'runVersion',
      'methodId',
      'methodVersion',
      'evidenceKind',
      'observations',
    ],
    [],
    input,
    '',
  );
  requireValue(
    value.schema === 'prisma-prim-knowledge-observations/v1' &&
      value.dataKind === 'synthetic',
    input,
    '',
  );
  for (const key of ['corpusId', 'expectationSetId', 'runId', 'methodId'])
    id(value[key], input, '/' + key);
  for (const key of [
    'corpusVersion',
    'expectationSetVersion',
    'runVersion',
    'methodVersion',
  ])
    version(value[key], input, '/' + key);
  oneOf(
    value.evidenceKind,
    ['authored_fixture', 'captured_declared'],
    input,
    '/evidenceKind',
  );
  requireValue(
    value.corpusId === bundle.content.corpusId &&
      value.corpusVersion === bundle.content.corpusVersion &&
      value.expectationSetId === bundle.expectations.expectationSetId &&
      value.expectationSetVersion === bundle.expectations.expectationSetVersion,
    input,
    '',
    'E_REFERENCE',
  );
  list(value.observations, 200, input, '/observations');
  value.observations.forEach((item, index) => {
    const path = `/observations/${index}`;
    keys(
      item,
      [
        'caseId',
        'caseVersion',
        'profileId',
        'purpose',
        'mode',
        'status',
        'retrievalRefs',
        'outcome',
        'citations',
        'initialFields',
        'finalFields',
        'humanEventRef',
      ],
      ['answer'],
      input,
      path,
    );
    id(item.caseId, input, path + '/caseId');
    version(item.caseVersion, input, path + '/caseVersion');
    id(item.profileId, input, path + '/profileId');
    oneOf(item.purpose, ['cited-answer', 'analysis'], input, path + '/purpose');
    oneOf(item.mode, ['current', 'historical'], input, path + '/mode');
    oneOf(
      item.status,
      ['completed', 'failed', 'not_run'],
      input,
      path + '/status',
    );
    const owner = bundle.expectations.cases.find(
      (candidate) => candidate.caseId === item.caseId,
    );
    requireValue(
      owner !== undefined &&
        owner.caseVersion === item.caseVersion &&
        owner.profileId === item.profileId &&
        owner.purpose === item.purpose &&
        owner.mode === item.mode,
      input,
      path,
      'E_REFERENCE',
    );
    if (item.status === 'completed') {
      refs(item.retrievalRefs, input, path + '/retrievalRefs');
      oneOf(item.outcome, outcomes, input, path + '/outcome');
      citations(item.citations, input, path + '/citations');
      fields(item.initialFields, input, path + '/initialFields');
      fields(item.finalFields, input, path + '/finalFields');
      if (item.humanEventRef !== null)
        id(item.humanEventRef, input, path + '/humanEventRef');
      if (Object.hasOwn(item, 'answer'))
        text(item.answer, 16000, input, path + '/answer');
    } else {
      for (const key of [
        'retrievalRefs',
        'outcome',
        'citations',
        'initialFields',
        'finalFields',
        'humanEventRef',
      ])
        requireValue(item[key] === null, input, path + '/' + key);
      if (Object.hasOwn(item, 'answer'))
        requireValue(item.answer === null, input, path + '/answer');
    }
  });
  unique(value.observations, (item) => item.caseId, input, '/observations');
  return value;
}
