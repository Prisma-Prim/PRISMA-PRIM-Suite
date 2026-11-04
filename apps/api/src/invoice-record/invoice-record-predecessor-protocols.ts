import { strFromU8, unzipSync } from 'fflate';
import { expect } from 'vitest';
import {
  fixtureHash,
  fixtureHeaders,
  fixtureObject,
  fixtureObjects,
  fixtureString,
} from '../documents/external-invoice-migration.test-support.js';
export type UpgradePayload =
  { kind: 'json'; value: unknown } | { kind: 'binary'; base64: string };
export interface UpgradeCallOptions {
  method?: string;
  companyId?: string;
  identity?: Record<string, string>;
  requestHeaders?: Record<string, string>;
  key?: string;
  payload?: UpgradePayload;
}
export function invoicePredecessorProtocols(input: {
  context: Record<string, unknown>;
  call: (path: string, options?: UpgradeCallOptions) => Promise<Response>;
  read: (path: string, options?: UpgradeCallOptions) => Promise<unknown>;
}) {
  const { context, call, read } = input;
  const capturedCommands = fixtureObjects(context.capturedCommands),
    nativeCommands = fixtureObjects(context.native0093Commands);
  async function replayCapturedCommands(commands: Record<string, unknown>[]) {
    let exact = 0;
    let currentDocument = 0;
    let currentRequest = 0;
    let nativeReceipt = 0;
    for (const command of commands) {
      const path = fixtureString(command.path);
      const identity = fixtureHeaders(command.headers);
      const commandCompanyId = fixtureString(command.companyId);
      const payload: UpgradePayload =
        typeof command.binaryBodyBase64 === 'string'
          ? { kind: 'binary', base64: command.binaryBodyBase64 }
          : { kind: 'json', value: command.body };
      const options = { identity, companyId: commandCompanyId };
      const response = await call(path, {
        ...options,
        method: fixtureString(command.method),
        requestHeaders: fixtureHeaders(command.requestHeaders),
        payload,
      });
      expect(response.status, path).toBe(command.status);
      const actual: unknown = await response.json();
      expect(actual, path).toEqual(command.replay);
      if (path === '/documents') {
        expect(command.replayMeaning).toBe(
          'Same registration identity; complete current native readDetail, independently verified by GET.',
        );
        const id = fixtureString(fixtureObject(actual).id);
        expect(id).toBe(fixtureObject(command.response).id);
        expect(await read('/documents/' + id, options)).toEqual(actual);
        currentDocument++;
      } else if (path === '/commercial-intake/requests') {
        expect([
          'Exact conserved native command response.',
          'Same Request identity; complete current native detail, independently verified by GET.',
        ]).toContain(command.replayMeaning);
        if (
          command.replayMeaning === 'Exact conserved native command response.'
        )
          expect(actual, path).toEqual(command.response);
        const id = fixtureString(fixtureObject(actual).id);
        expect(id).toBe(fixtureObject(command.response).id);
        expect(
          await read('/commercial-intake/requests/' + id, options),
        ).toEqual(actual);
        currentRequest++;
      } else if (
        /^\/commercial-intake\/opportunities\/[^/]+\/(?:next-action|responsible|stage|outcome)$/u.test(
          path,
        )
      ) {
        expect(command.replayMeaning).toBe(
          'Exact conserved native Opportunity receipt; complete current original Request independently verified by GET.',
        );
        const replay = fixtureObject(actual);
        const originalResponse = fixtureObject(command.response);
        // These four native protocols return a past immutable receipt
        // alongside the complete current original Request.
        expect(replay.receipt, path).toEqual(originalResponse.receipt);
        const request = fixtureObject(replay.request);
        const id = fixtureString(request.id);
        expect(id).toBe(fixtureObject(originalResponse.request).id);
        expect(
          await read('/commercial-intake/requests/' + id, options),
        ).toEqual(request);
        nativeReceipt++;
      } else if (/\/follow-up$/u.test(path)) {
        expect(command.replayMeaning).toBe(
          'Exact closed native opportunity-follow-up.v1 past receipt, independently of later date or outcome state.',
        );
        expect(actual, path).toEqual(command.response);
        exact++;
      } else {
        expect(command.replayMeaning).toBe(
          'Exact conserved native command response.',
        );
        expect(actual, path).toEqual(command.response);
        exact++;
      }
    }
    return { exact, currentDocument, currentRequest, nativeReceipt };
  }
  async function originalBytes() {
    const knowledge = fixtureObject(context.knowledge);
    for (const [documentId, versionId, expected] of [
      [context.documentId, context.versionId, context.pdfSha256],
      [knowledge.documentId, knowledge.versionId, knowledge.pdfSha256],
    ]) {
      const response = await call(
        `/documents/${fixtureString(documentId)}/versions/${fixtureString(versionId)}/content`,
      );
      expect(response.status).toBe(200);
      expect(fixtureHash(new Uint8Array(await response.arrayBuffer()))).toBe(
        expected,
      );
    }
    const exported = fixtureObject(context.export);
    const response = await call(fixtureString(exported.path), {
      method: 'POST',
      payload: { kind: 'json', value: exported.body },
    });
    expect(response.status).toBe(200);
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    const manifestBytes = files['manifest.json'];
    if (!manifestBytes) throw new Error('The native ZIP manifest is missing.');
    const manifest = fixtureObject(JSON.parse(strFromU8(manifestBytes)));
    expect(typeof manifest.preparedAt).toBe('string');
    expect(
      Object.fromEntries(
        Object.entries(manifest).filter(([key]) => key !== 'preparedAt'),
      ),
    ).toEqual(exported.manifest);
    expect(
      Object.entries(files)
        .filter(([path]) => path !== 'manifest.json')
        .map(([path, bytes]) => ({
          path,
          size: bytes.byteLength,
          sha256: fixtureHash(bytes),
        }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    ).toEqual(exported.files);
    return 2;
  }
  async function deliveredPrivateAndCommercialFacts() {
    let pdfCount = 0;
    const privateTask = fixtureObject(context.internalTasks);
    expect(await read('/company-internal-tasks')).toEqual(privateTask.list);
    expect(await read('/company-internal-tasks/eligible-assignees')).toEqual(
      privateTask.eligible,
    );
    expect(
      await read(
        '/company-internal-tasks/' + fixtureString(privateTask.taskId),
      ),
    ).toEqual(privateTask.detail);
    for (const commercial of [
      ...fixtureObjects(context.commercialSources),
      ...fixtureObjects(context.native0093ContractSources),
    ]) {
      const source = fixtureObject(commercial.source);
      const sourceCompanyId = fixtureString(source.companyId);
      const capturedIdentity = [...capturedCommands, ...nativeCommands].find(
        (command) =>
          command.companyId === sourceCompanyId &&
          fixtureHeaders(command.headers)['x-test-external-subject'] ===
            'estimate-offer-preparer',
      );
      if (!capturedIdentity)
        throw new Error('The conserved Commercial caller is missing.');
      const options = {
        companyId: sourceCompanyId,
        identity: fixtureHeaders(capturedIdentity.headers),
      };
      const current = fixtureObject(
        await read(fixtureString(commercial.contractPath), options),
      );
      expect(current.contract).toEqual(commercial.contract);
      const contract = fixtureObject(commercial.contract);
      const version = fixtureObject(contract.version);
      expect(version).toMatchObject({
        versionNumber: 2,
        decisionState: 'APPROVED',
        executionState: 'EXECUTED',
        signature: commercial.declaration,
      });
      const firstVersion = fixtureObject(
        fixtureObject(commercial.unexecutedFirstVersion).version,
      );
      const historical = fixtureObject(
        await read(
          fixtureString(commercial.contractPath) +
            '/versions/' +
            fixtureString(firstVersion.id),
          options,
        ),
      );
      expect(fixtureObject(historical.contract).version).toMatchObject({
        id: firstVersion.id,
        versionNumber: 1,
        executionState: 'NOT_EXECUTED',
        recipient: firstVersion.recipient,
      });
      const original = await call(
        `/documents/${fixtureString(fixtureObject(commercial.document).id)}/versions/${fixtureString(commercial.documentVersionId)}/content/${fixtureString(commercial.representationId)}`,
        options,
      );
      expect(original.status).toBe(200);
      const bytes = new Uint8Array(await original.arrayBuffer());
      expect(bytes.byteLength).toBe(commercial.pdfSize);
      expect(fixtureHash(bytes)).toBe(commercial.pdfSha256);
      pdfCount++;
    }
    const statuses = new Set<string>();
    for (const commercial of fixtureObjects(context.commercialDateCases)) {
      const options = {
        companyId: fixtureString(commercial.companyId),
        identity: fixtureHeaders(commercial.headers),
      };
      const detail = await read(fixtureString(commercial.path), options);
      expect(detail).toEqual(commercial.detail);
      statuses.add(
        fixtureString(
          fixtureObject(fixtureObject(detail).initialOpportunity).status,
        ),
      );
      const opportunityId = fixtureString(commercial.opportunityId);
      expect(
        await read(
          `/commercial-intake/opportunities/${opportunityId}/outcome-history`,
          options,
        ),
      ).toEqual(commercial.outcomeHistory);
      expect(
        await read(
          `/commercial-intake/opportunities/${opportunityId}/stage-history`,
          options,
        ),
      ).toEqual(commercial.stageHistory);
    }
    expect([...statuses].sort()).toEqual([
      'ARCHIVED',
      'DISQUALIFIED',
      'LOST',
      'ON_HOLD',
      'OPEN',
      'WON',
    ]);
    for (const invoice of fixtureObjects(context.externalInvoiceSources)) {
      const options = {
        companyId: fixtureString(invoice.companyId),
        identity: fixtureHeaders(invoice.headers),
      };
      const path = fixtureString(invoice.path);
      expect(await read(path, options)).toEqual(invoice.detail);
      expect(await read(path + '/versions', options)).toEqual(invoice.versions);
      expect(await read(path + '/correction-history', options)).toEqual(
        invoice.corrections,
      );
      for (const representation of fixtureObjects(invoice.representations)) {
        const response = await call(
          fixtureString(representation.path),
          options,
        );
        expect(response.status).toBe(200);
        const bytes = new Uint8Array(await response.arrayBuffer());
        expect(bytes.byteLength).toBe(representation.size);
        expect(fixtureHash(bytes)).toBe(representation.sha256);
        pdfCount++;
      }
    }
    return pdfCount;
  }

  async function dates() {
    const date = fixtureObject(context.opportunityFollowUpPredecessor);
    const companyId = fixtureString(date.companyId),
      identity = fixtureHeaders(date.preparerHeaders),
      options = { companyId, identity };
    expect(await read('/access/current-actor', options)).toEqual(date.actor);
    expect(
      await read('/access/current-actor', {
        companyId,
        identity: fixtureHeaders(date.probeHeaders),
      }),
    ).toEqual(date.probeActor);
    const cases = fixtureObjects(date.cases);
    expect(cases).toHaveLength(12);
    let facts = 0;
    for (const entry of cases) {
      const path = fixtureString(entry.datePath);
      expect(await read(fixtureString(entry.path), options)).toEqual(
        entry.nativeDetail,
      );
      const current = fixtureObject(await read(path, options));
      expect(current).toEqual(entry.current);
      const pages = fixtureObjects(entry.historyPages);
      expect(pages[0]).toEqual(current.history);
      let last = pages[0];
      for (const page of pages.slice(1)) {
        if (!last) throw new Error('Missing Date predecessor page.');
        const cursor = fixtureString(last.nextCursor);
        expect(
          await read(
            path + '/history?cursor=' + encodeURIComponent(cursor),
            options,
          ),
        ).toEqual(page);
        last = page;
      }
      facts += pages.reduce(
        (total, page) => total + fixtureObjects(page.entries).length,
        0,
      );
    }
    expect(facts).toBe(41);
    expect(await read(fixtureString(date.discoveryPath), options)).toEqual(
      date.discovery,
    );
    expect(fixtureObjects(fixtureObject(date.discovery).items)).toHaveLength(5);
    for (const probe of fixtureObjects(date.privacyProbes))
      expect(
        await read(fixtureString(probe.path), {
          companyId: fixtureString(probe.companyId),
          identity: fixtureHeaders(probe.headers),
        }),
      ).toEqual(probe.value);
    expect(date.materialDateFacts).toBe(41);
    expect(date.distinctDateReceipts).toBe(42);
  }
  return {
    replayCapturedCommands,
    originalBytes,
    deliveredPrivateAndCommercialFacts,
    dates,
  };
}
