import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActorContext } from '../access/access.types.js';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { SERVER_CLOCK } from '../clock/server-clock.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  knowledgeSourceCommands,
  knowledgeSources,
} from '../database/schema/index.js';
import { DocumentContentService } from '../documents/document-content.service.js';
import { DocumentReadBoundary } from '../documents/document-read-boundary.js';
import { KnowledgeAuthorization } from './knowledge.authorization.js';
import { KnowledgeService } from './knowledge.service.js';

const id = '00000000-0000-4000-8000-000000008101';
const actor: ActorContext = {
  internalUserId: id,
  workspaceMembershipId: id,
  workspaceId: id,
  workspaceName: 'Fictional boundary fixture',
  displayName: 'Fictional authorized reader',
  email: 'fixture@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id,
    displayName: 'Fictional Company',
    clientPermissions: [],
  },
};
const source = {
  id,
  workspaceId: id,
  companyId: id,
  documentId: id,
  documentVersionId: id,
  representationId: id,
  revision: 2,
  state: 'admitted',
  sourceSha256: 'a'.repeat(64),
  projectionSha256: 'b'.repeat(64),
  language: 'en',
  ownerReference: 'Fictional owner',
  provenance: 'Fictional manual source',
  rightsEvidenceReference: 'Synthetic boundary test only',
  permittedPurpose: 'cited-evidence',
  confidentiality: 'company-confidential',
  effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
  effectiveUntil: new Date('2027-01-01T00:00:00.000Z'),
  createdByMembershipId: id,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
} satisfies typeof knowledgeSources.$inferSelect;

/**
 * A prohibited persisted financial Knowledge Source cannot be created lawfully.
 * These tests deliberately inject that invalid state at the Document/database
 * collaborators to exercise the public Knowledge service's defense in depth.
 * Native HTTP/PG refusal and storage guard proof use real financial Documents.
 */
describe('Knowledge financial-family exclusion under invalid-state injection', () => {
  const download = vi.fn();
  const readProjection = vi.fn();
  const interactions: unknown[] = [];
  let service: KnowledgeService;
  let close: () => Promise<void>;

  beforeEach(async () => {
    vi.stubEnv('KNOWLEDGE_EVIDENCE_ENABLED', 'true');
    interactions.length = 0;
    let selectedTable: unknown;
    const rows = () => (selectedTable === knowledgeSources ? [source] : []);
    const query = {
      select: vi.fn(() => query),
      from: vi.fn((table: unknown) => {
        selectedTable = table;
        if (table !== knowledgeSources && table !== knowledgeSourceCommands)
          readProjection(table);
        return query;
      }),
      where: vi.fn(() => query),
      orderBy: vi.fn(() => query),
      limit: vi.fn(() => query),
      for: vi.fn(async () => rows()),
      then: (fulfilled: (value: (typeof source)[]) => unknown) =>
        Promise.resolve(rows()).then(fulfilled),
    };
    const module = await Test.createTestingModule({
      providers: [
        KnowledgeService,
        {
          provide: DatabaseContext,
          useValue: {
            transaction: (work: () => Promise<unknown>) => work(),
            connection: {
              ...query,
              execute: vi.fn(),
              insert: vi.fn(() => ({
                values: (value: unknown) => interactions.push(value),
              })),
            },
          },
        },
        {
          provide: KnowledgeAuthorization,
          useValue: { require: async () => id },
        },
        {
          provide: DocumentReadBoundary,
          useValue: {
            requireVisible: async () => ({
              companyId: id,
              document: { type: 'external-invoice' },
            }),
          },
        },
        {
          provide: DocumentContentService,
          useValue: { downloadWithinReadTransaction: download },
        },
        { provide: AccountabilityService, useValue: {} },
        {
          provide: SERVER_CLOCK,
          useValue: { now: () => new Date('2026-11-01T00:00:00.000Z') },
        },
      ],
    }).compile();
    service = module.get(KnowledgeService);
    close = () => module.close();
  });
  afterEach(async () => {
    await close();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('refuses drafting before looking up any source, reading bytes or creating effects', async () => {
    await expect(
      service.create({
        actor,
        key: 'financial-draft',
        body: {
          documentId: id,
          documentVersionId: id,
          representationId: id,
          sourceSha256: source.sourceSha256,
          language: 'en',
          ownerReference: 'Fictional owner',
          provenance: 'Fictional external invoice',
          rightsEvidenceReference: 'Synthetic all-grants refusal',
          permittedPurpose: 'cited-evidence',
          effectiveFrom: '2026-01-01T00:00:00.000Z',
          effectiveUntil: '2027-01-01T00:00:00.000Z',
          passages: [{ locator: 'page-1', text: 'Protected fictional text' }],
        },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(download).not.toHaveBeenCalled();
    expect(readProjection).not.toHaveBeenCalled();
    expect(interactions).toEqual([]);
  });

  it('refuses administration and exact passage retrieval before projection access', async () => {
    await expect(service.inspect(actor, id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.getPassage(actor, id, 'page-1', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(download).not.toHaveBeenCalled();
    expect(readProjection).not.toHaveBeenCalled();
    expect(interactions).toEqual([]);
  });

  it('refuses admission of a prohibited injected source without new effects', async () => {
    await expect(
      service.change({
        actor,
        sourceId: id,
        key: 'financial-admit',
        action: 'admit',
        body: {
          expectedRevision: 1,
          attestation: 'exact-version-source-and-use-reviewed/v1',
          sourceSha256: source.sourceSha256,
          projectionSha256: source.projectionSha256,
        },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(download).not.toHaveBeenCalled();
    expect(readProjection).not.toHaveBeenCalled();
    expect(interactions).toEqual([]);
  });

  it('filters a prohibited admitted source out of list and search without exposing a reference', async () => {
    await expect(service.list(actor, {})).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    await expect(
      service.search(actor, { query: 'Protected' }),
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(download).not.toHaveBeenCalled();
    expect(readProjection).not.toHaveBeenCalled();
    expect(interactions).toHaveLength(2);
    expect(interactions).toEqual([
      expect.objectContaining({ operation: 'list', sourceReferences: [] }),
      expect.objectContaining({ operation: 'search', sourceReferences: [] }),
    ]);
  });
});
