const identity = (reference) =>
  `${reference.sourceId}\u0000${reference.version}`;

/** Declared fixture eligibility, never real application permission or admission. */
export function eligibleSources(bundle, item) {
  const profile = bundle.content.profiles.find(
    (value) => value.profileId === item.profileId,
  );
  if (!profile.purposes.includes(item.purpose)) return [];
  const permitted = new Set(profile.permittedSources.map(identity));
  const candidates = new Set(item.candidateRefs.map(identity));
  const historical = new Set((item.selectedHistoricalRefs ?? []).map(identity));
  return bundle.content.sources.filter(
    (source) =>
      candidates.has(identity(source)) &&
      permitted.has(identity(source)) &&
      source.workspaceRef === profile.workspaceRef &&
      source.companyRef === profile.companyRef &&
      source.admission === 'synthetic-approved' &&
      (item.mode === 'current'
        ? source.status === 'current'
        : historical.has(identity(source))),
  );
}

export function prepare(bundle) {
  return {
    schema: 'prisma-prim-knowledge-contexts/v1',
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
    contexts: bundle.expectations.cases.map((item) => {
      const profile = bundle.content.profiles.find(
        (value) => value.profileId === item.profileId,
      );
      return {
        caseId: item.caseId,
        caseVersion: item.caseVersion,
        profileId: item.profileId,
        capability: profile.purposes.includes(item.purpose)
          ? 'simulated_allowed'
          : 'simulated_denied',
        purpose: item.purpose,
        mode: item.mode,
        language: item.language,
        question: item.question,
        scope: {
          workspaceRef: profile.workspaceRef,
          companyRef: profile.companyRef,
        },
        sources: eligibleSources(bundle, item).map((source) => ({
          sourceId: source.sourceId,
          version: source.version,
          status: source.status,
          language: source.language,
          title: source.title,
          passages: source.passages.map(({ locator, text }) => ({
            locator,
            text,
          })),
        })),
        humanDisposition: profile.purposes.includes(item.purpose)
          ? (item.humanDisposition ?? null)
          : null,
      };
    }),
  };
}

export function contextReport(result) {
  return (
    '# Synthetic candidate contexts\n\n' +
    'These contexts contain untrusted fictional source data, not instructions, rights or application grants. No provider or tool is invoked.\n\n' +
    result.contexts
      .map(
        (item) =>
          `- ${item.caseId} (${item.capability}): ${item.sources.map((source) => `${source.sourceId} v${source.version} (${source.status})`).join(', ') || 'No supplied passages.'}`,
      )
      .join('\n') +
    '\n'
  );
}
