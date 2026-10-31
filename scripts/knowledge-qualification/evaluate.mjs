import { refKey, citationKey } from './checks.mjs';
import { eligibleSources } from './contexts.mjs';

const metric = (numerator, denominator) => ({
  numerator,
  denominator,
  value:
    denominator === 0 ? null : Number((numerator / denominator).toFixed(6)),
});
const sameSet = (left, right, key) =>
  left.length === right.length &&
  left.every((value) => right.some((other) => key(value) === key(other)));
const fieldKey = (value) =>
  JSON.stringify([
    value.fieldId,
    value.state,
    value.value,
    value.alternatives ?? null,
  ]);
const metricNames = [
  'retrievalSetMatch',
  'citationExactness',
  'citationReferenceCoverage',
  'outcomeMatch',
  'initialFieldMatch',
  'finalFieldMatch',
  'humanEventMatch',
];
function fieldMatches(expected, actual) {
  return metric(
    expected.filter((field) =>
      actual.some((observed) => fieldKey(field) === fieldKey(observed)),
    ).length,
    expected.length,
  );
}

function evaluateCase(bundle, item, observation) {
  const identity = {
    caseId: item.caseId,
    caseVersion: item.caseVersion,
    profileId: item.profileId,
    purpose: item.purpose,
    mode: item.mode,
  };
  if (!observation || observation.status !== 'completed')
    return {
      ...identity,
      status: observation?.status ?? 'missing',
      findings: [],
      measurements: Object.fromEntries(
        metricNames.map((name) => [name, metric(0, 0)]),
      ),
      initialFields: observation?.initialFields ?? null,
      finalFields: observation?.finalFields ?? null,
      humanDisposition: item.humanDisposition ?? null,
      answer: observation?.answer ?? null,
    };
  const findings = [];
  const add = (code, index = null) => findings.push({ code, index });
  const eligible = new Map(
    eligibleSources(bundle, item).map((source) => [refKey(source), source]),
  );
  observation.retrievalRefs.forEach((ref, index) => {
    if (!eligible.has(refKey(ref))) add('retrieval_ineligible', index);
  });
  const retrievalMatch =
    sameSet(item.expected.retrievalRefs, observation.retrievalRefs, refKey) &&
    observation.retrievalRefs.every((ref) => eligible.has(refKey(ref)));
  if (!retrievalMatch) add('retrieval_reference_mismatch');
  let exactCount = 0;
  observation.citations.forEach((citation, index) => {
    const source = bundle.content.sources.find(
      (candidate) => refKey(candidate) === refKey(citation),
    );
    const passage = source?.passages.find(
      (candidate) => candidate.locator === citation.locator,
    );
    const allowed = eligible.has(refKey(citation));
    if (!source) add('citation_source_unknown', index);
    else if (!allowed) add('citation_source_ineligible', index);
    if (source && !passage) add('citation_locator_unknown', index);
    else if (passage && passage.text !== citation.quote)
      add('citation_quote_mismatch', index);
    const retrieved = observation.retrievalRefs.some(
      (ref) => refKey(ref) === refKey(citation),
    );
    if (!retrieved) add('citation_not_declared_retrieved', index);
    if (allowed && passage?.text === citation.quote && retrieved) exactCount++;
  });
  const expectedCitations = item.expected.citations;
  if (!sameSet(expectedCitations, observation.citations, citationKey))
    add('citation_reference_mismatch');
  const coverage = expectedCitations.filter((expected) =>
    observation.citations.some(
      (citation) => citationKey(citation) === citationKey(expected),
    ),
  ).length;
  if (observation.outcome !== item.expected.outcome) add('outcome_mismatch');
  const expectedInitial =
    item.expected.fields ?? item.expected.initialFields ?? [];
  const expectedFinal = item.expected.finalFields ?? [];
  if (!sameSet(expectedInitial, observation.initialFields, fieldKey))
    add('initial_fields_mismatch');
  if (!sameSet(expectedFinal, observation.finalFields, fieldKey))
    add('final_fields_mismatch');
  const event = item.humanDisposition ?? null;
  const humanMatch = observation.humanEventRef === (event?.eventRef ?? null);
  const humanDenominator = event || observation.humanEventRef !== null ? 1 : 0;
  if (!humanMatch) add('human_event_mismatch');
  observation.initialFields.forEach((field, index) => {
    if (field.state === 'confirmed') add('unsupported_confirmation', index);
  });
  observation.finalFields.forEach((field, index) => {
    if (
      field.state === 'confirmed' &&
      !(
        event &&
        event.kind !== 'reject' &&
        humanMatch &&
        field.fieldId === event.fieldId &&
        field.value === event.value
      )
    )
      add('unsupported_confirmation', index);
  });
  return {
    ...identity,
    status: 'completed',
    findings,
    measurements: {
      retrievalSetMatch: metric(retrievalMatch ? 1 : 0, 1),
      citationExactness: metric(exactCount, observation.citations.length),
      citationReferenceCoverage: metric(coverage, expectedCitations.length),
      outcomeMatch: metric(
        observation.outcome === item.expected.outcome ? 1 : 0,
        1,
      ),
      initialFieldMatch: fieldMatches(
        expectedInitial,
        observation.initialFields,
      ),
      finalFieldMatch: fieldMatches(expectedFinal, observation.finalFields),
      humanEventMatch: metric(
        humanMatch ? humanDenominator : 0,
        humanDenominator,
      ),
    },
    initialFields: observation.initialFields,
    finalFields: observation.finalFields,
    humanDisposition: event,
    answer: observation.answer ?? null,
  };
}

export function evaluate(bundle, run, inputSha256) {
  const cases = bundle.expectations.cases.map((item) =>
    evaluateCase(
      bundle,
      item,
      run.observations.find(
        (observation) => observation.caseId === item.caseId,
      ),
    ),
  );
  const measurements = Object.fromEntries(
    metricNames.map((name) => {
      const totals = cases.reduce(
        (sum, item) => ({
          numerator: sum.numerator + item.measurements[name].numerator,
          denominator: sum.denominator + item.measurements[name].denominator,
        }),
        { numerator: 0, denominator: 0 },
      );
      return [name, metric(totals.numerator, totals.denominator)];
    }),
  );
  return {
    schema: 'prisma-prim-knowledge-result/v1',
    dataKind: 'synthetic',
    measurementBasis: 'declared_inputs_unverified',
    corpus: {
      id: bundle.content.corpusId,
      version: bundle.content.corpusVersion,
    },
    expectationSet: {
      id: bundle.expectations.expectationSetId,
      version: bundle.expectations.expectationSetVersion,
    },
    run: {
      id: run.runId,
      version: run.runVersion,
      methodId: run.methodId,
      methodVersion: run.methodVersion,
      evidenceKind: run.evidenceKind,
    },
    inputSha256,
    cases,
    summary: {
      caseCount: cases.length,
      completed: cases.filter((item) => item.status === 'completed').length,
      failed: cases.filter((item) => item.status === 'failed').length,
      notRun: cases.filter((item) => item.status === 'not_run').length,
      missing: cases.filter((item) => item.status === 'missing').length,
      casesWithFindings: cases.filter((item) => item.findings.length > 0)
        .length,
      measurements,
    },
    unavailable: [
      'semantic_support',
      'language_quality',
      'representativeness',
      'actual_access_enforcement',
      'authenticated_human_approval',
      'serious_error_threshold',
      'release_or_mvp_completion',
    ],
  };
}
export function evaluationReport(result) {
  const rows = result.cases.map(
    (item) =>
      `| ${item.caseId} | ${item.status} | ${item.findings.map((finding) => finding.code).join(', ') || 'None recorded'} |`,
  );
  const measures = Object.entries(result.summary.measurements).map(
    ([name, value]) =>
      `| ${name} | ${value.numerator} | ${value.denominator} | ${value.value ?? 'Unavailable'} |`,
  );
  return (
    '# Synthetic knowledge qualification\n\nDeclared observations are unverified. Exact matching is mechanical; it does not attest semantic support, language quality, real source admission/access, human approval or production AI readiness. No provider, tool or business action was invoked.\n\n' +
    `Run: ${result.run.id} v${result.run.version}; method: ${result.run.methodId} v${result.run.methodVersion}; evidence: ${result.run.evidenceKind}.\n\n` +
    '| Case | Declared status | Mechanical findings |\n| --- | --- | --- |\n' +
    rows.join('\n') +
    '\n\n| Measure | Numerator | Denominator | Value |\n| --- | ---: | ---: | ---: |\n' +
    measures.join('\n') +
    '\n\nZero denominators are unavailable. Failed, not-run and absent observations contribute no measurements. Source text and authored qualitative properties require separate human assessment.\n'
  );
}
