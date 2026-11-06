import { randomUUID } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PDF_B } from '../documents/mission-document.test-support.js';
import {
  openWorkingEvidenceFixture,
  digest,
  json,
  record,
  text,
  type WorkingEvidenceFixture,
} from './working-evidence.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

withPostgres(
  'Manual Working Evidence Case public records and exact proof',
  () => {
    let fixture: WorkingEvidenceFixture;
    let projectId: string;
    let clientId: string;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      fixture = await openWorkingEvidenceFixture(databaseUrl);
    });
    beforeEach(async () => {
      ({ projectId, clientId } = await fixture.prepare());
    });
    afterAll(async () => {
      await fixture?.close();
    });
    const call = (...args: Parameters<WorkingEvidenceFixture['call']>) =>
      fixture.call(...args);
    const post = (path: string, body: unknown) =>
      call(path, { method: 'POST', body });
    const casesPath = () => `/projects/${projectId}/working-evidence-cases`;
    const sourcesPath = () => `/projects/${projectId}/working-evidence-sources`;
    const revisionPath = (receipt: Record<string, unknown>) =>
      `/working-evidence-cases/${text(receipt.caseId)}/revisions/${text(receipt.revisionId)}`;

    it('records a complete working observation and reopens frozen exact originals in a deterministic self-contained annex', async () => {
      const first = await fixture.source();
      const second = await fixture.source({
        bytes: PDF_B,
        title: 'Second fictional original',
      });
      const selector = await call(sourcesPath());
      expect(selector.status).toBe(200);
      const page = await json(selector);
      expect(Object.keys(page).sort()).toEqual([
        'format',
        'items',
        'nextCursor',
      ]);
      expect(page).toMatchObject({
        format: 'WORKING_EVIDENCE_CASE_SOURCE_PAGE/1',
        nextCursor: null,
      });
      if (!Array.isArray(page.items))
        throw new Error('Expected eligible exact sources.');
      expect(page.items).toHaveLength(2);
      for (const item of page.items)
        expect(Object.keys(record(item)).sort()).toEqual([
          'documentId',
          'representationId',
          'sourceTitle',
          'versionId',
          'versionNumber',
        ]);
      const body = fixture.recordBody([first, second]);
      const saved = await post(casesPath(), body);
      expect(saved.status).toBe(201);
      const receipt = await json(saved);
      expect(Object.keys(receipt).sort()).toEqual([
        'action',
        'caseId',
        'commandId',
        'format',
        'recordedAt',
        'revisionId',
        'revisionNumber',
      ]);
      expect(receipt).toMatchObject({
        format: 'WORKING_EVIDENCE_CASE_RECEIPT/1',
        commandId: body.commandId,
        revisionNumber: 1,
        action: 'RECORD',
      });
      const detail = await json(
        await call(`/working-evidence-cases/${text(receipt.caseId)}`),
      );
      expect(detail).toMatchObject({
        format: 'WORKING_EVIDENCE_CASE/1',
        projectId,
        originalClientId: clientId,
        current: {
          revisionId: receipt.revisionId,
          statement: body.values.statement,
        },
      });
      const evidence = record(record(detail.current).evidence);
      expect(evidence.state).toBe('visible');
      if (!Array.isArray(evidence.supports))
        throw new Error('Expected permitted supports.');
      const supports = evidence.supports.map(record);
      expect(supports).toHaveLength(2);
      expect(supports.map((support) => support.sha256)).toEqual([
        digest(first.bytes),
        digest(second.bytes),
      ]);
      const statement = await call(revisionPath(receipt) + '/statement');
      expect(statement.status).toBe(200);
      expect(statement.headers.get('cache-control')).toContain('no-store');
      expect(statement.headers.get('x-content-type-options')).toBe('nosniff');
      expect(statement.headers.get('content-disposition')).toContain(
        'attachment',
      );
      const html = await statement.text();
      expect(html).toContain('&lt;script&gt;untrusted literal&lt;/script&gt;');
      expect(html).not.toMatch(
        /<script|<form|https:\/\/example.test\/inert["']/iu,
      );
      expect(html).toContain('non-official');
      for (const support of supports) {
        const evidenceId = text(support.evidenceId);
        expect(html).toContain(
          `/#working-evidence/${text(receipt.caseId)}/${text(receipt.revisionId)}/${evidenceId}`,
        );
        const original = await call(
          revisionPath(receipt) + '/evidence/' + evidenceId,
        );
        expect(original.status).toBe(200);
        expect(digest(new Uint8Array(await original.arrayBuffer()))).toBe(
          support.sha256,
        );
      }
      const annex = await call(revisionPath(receipt) + '/annex');
      expect(annex.status).toBe(200);
      const bytes = new Uint8Array(await annex.arrayBuffer());
      const entries = unzipSync(bytes);
      expect(Object.keys(entries)).toEqual([
        'statement.html',
        'index.html',
        ...supports.map(
          (support) => `evidence/${text(support.evidenceId)}.pdf`,
        ),
      ]);
      for (const [index, source] of [first, second].entries()) {
        const support = supports[index];
        if (!support) throw new Error('Missing exact support.');
        const path = `evidence/${text(support.evidenceId)}.pdf`;
        expect(Buffer.from(entries[path] ?? [])).toEqual(source.bytes);
        for (const name of ['statement.html', 'index.html']) {
          const entry = entries[name];
          if (!entry) throw new Error('Missing annex HTML.');
          const offline = strFromU8(entry);
          expect(offline).toContain(path);
          expect(offline).not.toContain('/#working-evidence/');
        }
      }
      const again = await call(revisionPath(receipt) + '/annex');
      expect(again.status).toBe(200);
      expect(new Uint8Array(await again.arrayBuffer())).toEqual(bytes);
      expect(await json(await post(casesPath(), body))).toEqual(receipt);
      const activity = await json(await call('/activity-log'));
      expect(JSON.stringify(activity)).not.toContain('working_evidence_case.');
      expect(JSON.stringify(activity)).not.toContain(first.documentId);
    });

    it('preserves the complete predecessor after correction, native successor and two actual API restarts', async () => {
      const source = await fixture.source();
      const initialBody = fixture.recordBody([source]);
      const firstResponse = await post(casesPath(), initialBody);
      expect(firstResponse.status).toBe(201);
      const first = await json(firstResponse);
      const originalStatement = await (
        await call(revisionPath(first) + '/statement')
      ).text();
      const originalAnnex = new Uint8Array(
        await (await call(revisionPath(first) + '/annex')).arrayBuffer(),
      );
      const drafted = await post(`/documents/${source.documentId}/versions`, {
        expectedRevision: 3,
      });
      expect(drafted.status).toBe(201);
      const nextVersionId = text((await json(drafted)).versionId);
      const correctedLabels = await call(`/documents/${source.documentId}`, {
        method: 'PATCH',
        body: {
          expectedRevision: 4,
          title: 'Changed mutable source label',
          purpose: 'Changed literal purpose',
        },
      });
      expect(correctedLabels.status).toBe(200);
      const uploaded = await fixture.native.upload({
        documentId: source.documentId,
        versionId: nextVersionId,
        revision: 5,
        bytes: PDF_B,
      });
      expect(uploaded.status).toBe(201);
      const nextRepresentationId = text(
        (await json(uploaded)).representationId,
      );
      expect(
        (
          await post(
            `/documents/${source.documentId}/versions/${nextVersionId}/official-designation`,
            { expectedRevision: 6 },
          )
        ).status,
      ).toBe(200);
      const previousSupport = initialBody.values.supports[0];
      if (!previousSupport) throw new Error('Missing original support intent.');
      const correction = {
        format: 'WORKING_EVIDENCE_CASE_COMMAND/1',
        commandId: randomUUID(),
        expectedRevision: 1,
        reason:
          'Fictional observer clarified the statement and replaced its support',
        values: {
          ...initialBody.values,
          statement: 'Revised human working statement',
          supports: [
            {
              ...previousSupport,
              documentId: source.documentId,
              versionId: nextVersionId,
              representationId: nextRepresentationId,
            },
          ],
        },
      };
      const changed = await post(
        `/working-evidence-cases/${text(first.caseId)}/corrections`,
        correction,
      );
      expect(changed.status).toBe(201);
      const second = await json(changed);
      expect(second).toMatchObject({
        caseId: first.caseId,
        revisionNumber: 2,
        action: 'CORRECT',
      });
      for (let restart = 0; restart < 3; restart++) {
        if (restart > 0) await fixture.restart();
        expect(await json(await post(casesPath(), initialBody))).toEqual(first);
        expect(
          await json(
            await post(
              `/working-evidence-cases/${text(first.caseId)}/corrections`,
              correction,
            ),
          ),
        ).toEqual(second);
        expect(
          await (await call(revisionPath(first) + '/statement')).text(),
        ).toBe(originalStatement);
        expect(
          new Uint8Array(
            await (await call(revisionPath(first) + '/annex')).arrayBuffer(),
          ),
        ).toEqual(originalAnnex);
        expect(await json(await call(revisionPath(first)))).toMatchObject({
          statement: initialBody.values.statement,
          reason: null,
          previousRevisionId: null,
        });
        expect(await json(await call(revisionPath(second)))).toMatchObject({
          statement: correction.values.statement,
          previousRevisionId: first.revisionId,
          reason: correction.reason,
        });
        expect(
          await json(
            await call(
              `/working-evidence-cases/${text(first.caseId)}/revisions`,
            ),
          ),
        ).toMatchObject({
          items: [{ revisionNumber: 2 }, { revisionNumber: 1 }],
          nextCursor: null,
        });
      }
    });

    it('redacts the entire protected support set while retaining independent Case text and history', async () => {
      const source = await fixture.source();
      const command = fixture.recordBody([source]);
      const response = await post(casesPath(), command);
      expect(response.status).toBe(201);
      const receipt = await json(response);
      await fixture.revoke('/company-document-content-reader-assignments');
      const detail = await json(
        await call(`/working-evidence-cases/${text(receipt.caseId)}`),
      );
      expect(record(detail.current).evidence).toEqual({ state: 'unavailable' });
      expect(record(detail.current).statement).toBe(command.values.statement);
      expect(JSON.stringify(detail)).not.toContain(source.documentId);
      expect(JSON.stringify(detail)).not.toContain(source.representationId);
      expect(JSON.stringify(detail)).not.toMatch(
        /supports|sourceCount|sha256|filename/u,
      );
      for (const suffix of ['/statement', '/annex']) {
        const refused = await call(revisionPath(receipt) + suffix);
        expect(refused.status).toBe(404);
        expect(await refused.json()).toEqual({ code: 'not_found' });
      }
      const replay = await post(casesPath(), command);
      expect(replay.status).toBe(404);
      expect(await replay.json()).toEqual({ code: 'not_found' });
      const nativeHistory = await call(
        `/documents/${source.documentId}/versions`,
      );
      expect(nativeHistory.status).toBe(200);
      expect(await nativeHistory.json()).toMatchObject({
        versions: [{ id: source.versionId }],
      });
      expect(
        (
          await call(
            `/working-evidence-cases/${text(receipt.caseId)}/revisions`,
          )
        ).status,
      ).toBe(200);
    });

    it('returns one original receipt for same-key races and one complete successor for competing corrections', async () => {
      const source = await fixture.source();
      const command = fixture.recordBody([source]);
      const attempts = await Promise.all([
        post(casesPath(), command),
        post(casesPath(), command),
      ]);
      expect(attempts.map((response) => response.status)).toEqual([201, 201]);
      const receipts = await Promise.all(attempts.map(json));
      expect(receipts[0]).toEqual(receipts[1]);
      const initial = receipts[0];
      if (!initial) throw new Error('Missing recorded receipt.');
      const correctionPath = `/working-evidence-cases/${text(initial.caseId)}/corrections`;
      const corrections = [0, 1].map((index) => ({
        format: 'WORKING_EVIDENCE_CASE_COMMAND/1',
        commandId: randomUUID(),
        expectedRevision: 1,
        reason: `Fictional correction ${index + 1}`,
        values: {
          ...command.values,
          statement: `Working revision ${index + 1}`,
        },
      }));
      const outcomes = await Promise.all(
        corrections.map((body) => post(correctionPath, body)),
      );
      expect(outcomes.map((response) => response.status).sort()).toEqual([
        201, 409,
      ]);
      expect(
        await json(
          await call(
            `/working-evidence-cases/${text(initial.caseId)}/revisions`,
          ),
        ),
      ).toMatchObject({
        items: [{ revisionNumber: 2 }, { revisionNumber: 1 }],
        nextCursor: null,
      });
      const changedKey = await post(casesPath(), {
        ...command,
        values: {
          ...command.values,
          statement: 'Changed intent with the same key',
        },
      });
      expect(changedKey.status).toBe(409);
      expect(await changedKey.json()).toEqual({ code: 'conflict' });
    });

    it('keeps exact committed replay before Project closure while refusing new use', async () => {
      const source = await fixture.source();
      const command = fixture.recordBody([source]);
      const initial = await post(casesPath(), command);
      expect(initial.status).toBe(201);
      const receipt = await json(initial);
      await fixture.grant('/company-project-approver-assignments');
      const closed = await post(
        `/projects/${projectId}/lifecycle-transitions`,
        {
          action: 'cancel',
          expectedLifecycleRevision: 0,
          reason: 'Fictional Project cancelled after working record',
        },
      );
      expect(closed.status).toBe(200);
      expect(await json(await post(casesPath(), command))).toEqual(receipt);
      const refused = await post(casesPath(), {
        ...command,
        commandId: randomUUID(),
      });
      expect(refused.status).toBe(409);
      expect(await refused.json()).toEqual({ code: 'new_use_unavailable' });
      expect((await call(revisionPath(receipt) + '/annex')).status).toBe(200);
    });
  },
);
