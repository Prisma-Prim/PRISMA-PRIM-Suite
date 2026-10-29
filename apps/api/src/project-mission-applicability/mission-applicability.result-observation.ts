import type { TaskResultDeclaration } from '../task/task-results.types.js';

/** Resolve through the result owner first, then expose only the consumed observation. */
export function applicabilityResultObservation(
  result: TaskResultDeclaration | null,
) {
  if (!result) return null;
  const {
    documentId,
    versionId,
    versionNumber,
    title,
    status,
    representationId,
  } = result.reference;
  return {
    id: result.id,
    revision: result.revision,
    reference: {
      documentId,
      versionId,
      versionNumber,
      title,
      status,
      representationId,
    },
  };
}
