import { describe, expect, it } from 'vitest';
import { captureKnowledgeGrant } from './knowledge-captured-grants.js';

describe('Knowledge captured authority boundary', () => {
  it.each([
    'company_knowledge_source_administrator',
    'company_knowledge_evidence_reader',
  ])('retains only complete exact v1 %s captures', (bundle) => {
    expect(
      captureKnowledgeGrant({
        bundle,
        assignmentId: 'captured-assignment',
        permissionSetVersion: 'v1',
      }),
    ).toEqual({
      bundle,
      assignmentId: 'captured-assignment',
      permissionSetVersion: 'v1',
    });
  });
  it.each([undefined, null, 'v2', 'v99', 1])(
    'does not infer authority from unknown captured version %s',
    (permissionSetVersion) => {
      expect(
        captureKnowledgeGrant({
          bundle: 'company_knowledge_evidence_reader',
          assignmentId: 'captured-assignment',
          permissionSetVersion,
        }),
      ).toBeUndefined();
    },
  );
  it('does not turn an ordinary Document bundle into knowledge authority', () => {
    expect(
      captureKnowledgeGrant({
        bundle: 'company_document_registrar',
        assignmentId: 'captured-assignment',
        permissionSetVersion: 'v1',
      }),
    ).toBeUndefined();
  });
  it('cannot construct a grant without its assignment identity', () => {
    expect(
      captureKnowledgeGrant({
        bundle: 'company_knowledge_evidence_reader',
        assignmentId: undefined,
        permissionSetVersion: 'v1',
      }),
    ).toBeUndefined();
  });
});
