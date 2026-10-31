import { NotFoundException } from '@nestjs/common';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  createMissionDocumentFixture,
  json,
  record,
  text,
  type MissionDocumentFixture,
} from '../documents/mission-document.test-support.js';
import { TaskResultsService } from '../task/task-results.service.js';
import { preserveFrozenResultDocument } from '../task/task-results.test-support.js';
import {
  currentApplicability,
  demoProposal,
  observedApplicability,
  prepareApplicability,
} from './mission-applicability.test-support.js';

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)(
  'Applicability historical reference privacy through the owning result-reader boundary',
  () => {
    let fixture: MissionDocumentFixture;
    beforeAll(async () => {
      if (!url) throw new Error('PostgreSQL required');
      fixture = await createMissionDocumentFixture(url);
    });
    afterEach(() => vi.restoreAllMocks());
    afterAll(async () => fixture?.close());
    it('qualifies the hidden26th lookahead and cursor reference, and denies original receipt confirmation while current result evidence remains independently readable', async () => {
      const c = await prepareApplicability(fixture);
      for (const bundle of [
        'mission-applicability-coordinator',
        'document-content-uploader',
        'document-approver',
        'document-project-organizer',
        'task-result-recorder',
      ])
        await fixture.grant(`/company-${bundle}-assignments`);
      const reference = await preserveFrozenResultDocument({
        fixture,
        registration: {
          type: 'mission-deliverable',
          clientId: c.clientId,
          title: 'Historical privacy frozen output DEMO',
          purpose: 'Preserve exact old and current result observations',
        },
      });
      async function post(path: string, body: unknown, key?: string) {
        const response = await fixture.call(path, {
          method: 'POST',
          body,
          key,
        });
        expect(response.status).toBe(201);
        return json(response);
      }
      await post(`/documents/${reference.documentId}/project-association`, {
        action: 'link',
        projectId: c.projectId,
        expectedRevision: 0,
      });
      const firstResult = await post(`/tasks/${c.taskId}/results`, {
        ...reference,
        expectedTaskVersion: 1,
        expectedResultRevision: 0,
        declaration: 'Historical declaration DEMO',
      });
      const firstBody = {
          ...(await observedApplicability(fixture, c.path, c.taskId)),
          ...demoProposal,
        },
        firstFact = await post(
          c.path,
          firstBody,
          'historical-reference-original-demo',
        );
      function noCopiedResultProse(value: unknown) {
        const serialized = JSON.stringify(value);
        for (const prohibited of [
          'Historical declaration DEMO',
          'Current declaration DEMO',
          'Explicit independent result correction DEMO',
          '%PDF-',
        ])
          expect(serialized).not.toContain(prohibited);
      }
      expect(Object.keys(firstFact).sort()).toEqual([
        'action',
        'applicabilityRevision',
        'factId',
        'projectId',
      ]);
      noCopiedResultProse(firstFact);
      const firstCurrent = await currentApplicability(fixture, c.path);
      noCopiedResultProse(firstCurrent);
      noCopiedResultProse(await json(await fixture.call(c.path + '/history')));
      await post(`/tasks/${c.taskId}/results/corrections`, {
        ...reference,
        expectedTaskVersion: 1,
        expectedResultRevision: 1,
        declaration: 'Current declaration DEMO',
        reason: 'Explicit independent result correction DEMO',
      });
      let lastId = text(firstFact.factId);
      for (let index = 2; index <= 26; index++) {
        const fact = await post(c.path, {
          ...(await observedApplicability(fixture, c.path, c.taskId)),
          ...demoProposal,
          action: 'CORRECT_PROPOSAL',
          proposalId: lastId,
          reason: `Literal correction ${index} DEMO`,
          correctionReason: 'Preserve predecessor DEMO',
        });
        lastId = text(fact.factId);
      }
      const current = await currentApplicability(fixture, c.path);
      noCopiedResultProse(current);
      noCopiedResultProse(await json(await fixture.call(c.path + '/history')));
      noCopiedResultProse(
        await json(await fixture.call(c.path + '/history?beforeRevision=2')),
      );
      expect(
        record((await json(await fixture.call(c.path + '/history'))).history),
      ).toMatchObject({ hasMore: true, nextBeforeRevision: 2 });
      const before = (
        await fixture.pool.query(
          'SELECT (SELECT count(*) FROM mission_applicability_facts) facts,(SELECT count(*) FROM mission_applicability_commands) receipts,(SELECT count(*) FROM mission_applicability_events) events',
        )
      ).rows;
      const original =
        TaskResultsService.prototype.reviewEvidenceWithinTransaction;
      // There is no per-Document ACL in this owner. Inject only its public historical
      // reference denial; all current reads, HTTP, real facts, pagination and receipts remain real.
      vi.spyOn(
        TaskResultsService.prototype,
        'reviewEvidenceWithinTransaction',
      ).mockImplementation(function (this: TaskResultsService, input) {
        if (input.resultId === firstResult.resultId)
          throw new NotFoundException();
        return original.call(this, input);
      });
      expect((await currentApplicability(fixture, c.path)).revision).toBe(26);
      for (const suffix of [
        '/history',
        '/history?beforeRevision=2',
        '/history?beforeRevision=1',
      ]) {
        const response = await fixture.call(c.path + suffix);
        expect(response.status).toBe(200);
        expect(await json(response)).toEqual({
          history: { kind: 'unavailable' },
        });
      }
      const replay = await fixture.call(c.path, {
        method: 'POST',
        body: firstBody,
        key: 'historical-reference-original-demo',
      });
      expect(replay.status).toBe(404);
      const error = JSON.stringify(await json(replay));
      for (const hidden of [firstFact.factId, firstResult.resultId, c.taskId])
        expect(error).not.toContain(hidden);
      expect(
        (
          await fixture.pool.query(
            'SELECT (SELECT count(*) FROM mission_applicability_facts) facts,(SELECT count(*) FROM mission_applicability_commands) receipts,(SELECT count(*) FROM mission_applicability_events) events',
          )
        ).rows,
      ).toEqual(before);
    }, 60_000);
  },
);
