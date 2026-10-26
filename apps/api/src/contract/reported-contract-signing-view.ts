import {
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import { and, eq } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import type { DatabaseContext } from '../database/database-context.js';
import {
  contractSigningDeclarations,
  contractQualityRuns,
  contracts,
  contractVersions,
} from '../database/schema/index.js';
import {
  readConservedSigningPdf,
  type DocumentSigningReferenceService,
} from '../documents/document-signing-reference.service.js';
import { readContractDecision } from './contract-decision-command.js';
import { qualityRunView } from './contract-quality-view.js';
import {
  readReportedContractSigning,
  requireReportedSigningDates,
} from './reported-contract-signing.js';
import { storedModelContractSnapshot } from './model-contract-snapshot.js';

/** Shared immutable validation for Contract history and Project qualification. */
export async function storedSigningDeclaration(
  database: DatabaseContext,
  contract: typeof contracts.$inferSelect,
  version: typeof contractVersions.$inferSelect,
) {
  try {
    return await decodeStoredSigningDeclaration(database, contract, version);
  } catch {
    throw new InternalServerErrorException({
      code: 'CONTRACT_STORED_DECLARATION_INVALID',
    });
  }
}
async function decodeStoredSigningDeclaration(
  database: DatabaseContext,
  contract: typeof contracts.$inferSelect,
  version: typeof contractVersions.$inferSelect,
) {
  const [row] = await database.connection
    .select()
    .from(contractSigningDeclarations)
    .where(
      and(
        eq(contractSigningDeclarations.workspaceId, version.workspaceId),
        eq(contractSigningDeclarations.companyId, version.companyId),
        eq(contractSigningDeclarations.contractId, contract.id),
        eq(contractSigningDeclarations.contractVersionId, version.id),
      ),
    );
  if (!row) return null;
  const command = readReportedContractSigning(row.statement);
  const pdf = readConservedSigningPdf(row.pdf);
  requireReportedSigningDates(command, row.recordedAt);
  const snapshot = storedModelContractSnapshot(contract, version);
  const [run] = await database.connection
    .select()
    .from(contractQualityRuns)
    .where(
      and(
        eq(contractQualityRuns.workspaceId, row.workspaceId),
        eq(contractQualityRuns.companyId, row.companyId),
        eq(contractQualityRuns.contractId, row.contractId),
        eq(contractQualityRuns.contractVersionId, version.id),
        eq(contractQualityRuns.id, row.qualityRunId),
      ),
    );
  if (!run) throw new Error('Missing declaration Quality Check.');
  const qualityRun = qualityRunView(run, version, contract);
  const warnings = qualityRun.results
    .filter((r) => r.status === 'WARNING')
    .map((r) => r.code)
    .sort();
  if (
    contract.kind !== 'CONTRACT' ||
    contract.origin !== 'COMPANY_MODEL_OFFER' ||
    version.provenance !== 'COMPANY_MODEL_OFFER' ||
    version.decisionState !== 'APPROVED' ||
    version.executionState !== 'EXECUTED' ||
    version.supersededByVersionId !== null ||
    row.resultRevision !== version.createdContractRevision + 2 ||
    command.expectedContractRevision + 1 !== row.resultRevision ||
    row.representationChecksum !== snapshot.representation.sha256 ||
    pdf.documentId !== row.documentId ||
    pdf.documentVersionId !== row.documentVersionId ||
    pdf.representationId !== row.representationId ||
    command.documentId !== row.documentId ||
    command.documentVersionId !== row.documentVersionId ||
    command.representationId !== row.representationId ||
    run.evaluatedAt.getTime() !== row.recordedAt.getTime() ||
    run.actorWorkspaceMembershipId !== row.actorWorkspaceMembershipId ||
    run.actorInternalUserId !== row.actorInternalUserId ||
    qualityRun.results.some((r) => r.status === 'ERROR') ||
    !isDeepStrictEqual(warnings, [...command.acknowledgedWarningCodes].sort())
  )
    throw new Error('Invalid stored signing declaration.');
  return { row, command, qualityRun, pdf };
}

export async function readReportedSigningDeclaration(input: {
  database: DatabaseContext;
  documents: DocumentSigningReferenceService;
  actor: ActorContext;
  contract: typeof contracts.$inferSelect;
  version: typeof contractVersions.$inferSelect;
}) {
  const { database, documents, actor, contract, version } = input;
  const stored = await storedSigningDeclaration(database, contract, version);
  if (!stored) return null;
  const { row, command, qualityRun, pdf: frozen } = stored;
  const approval = await readContractDecision(
    database,
    actor,
    contract,
    version,
  );
  if (
    approval?.kind !== 'APPROVE' ||
    approval.id !== row.approvalDecisionId ||
    approval.qualityRun.id === row.qualityRunId ||
    approval.representationChecksum !== row.representationChecksum
  )
    throw new Error('Invalid declaration approval.');
  let pdf:
    { access: 'denied' } | { access: 'granted'; reference: typeof frozen } = {
    access: 'denied',
  };
  try {
    const qualified = await documents.exactWithinTransaction({
      actor,
      context: {
        companyId: contract.companyId,
        originalClientAccountId: contract.originalClientAccountId,
        contractId: contract.id,
        contractVersionId: version.id,
      },
      documentId: row.documentId,
      documentVersionId: row.documentVersionId,
      representationId: row.representationId,
      lock: false,
    });
    // Status may change from official to superseded; every other frozen fact is immutable.
    if (!isDeepStrictEqual({ ...qualified, status: frozen.status }, frozen))
      throw new Error('Invalid preserved PDF reference.');
    pdf = { access: 'granted', reference: frozen };
  } catch (error) {
    if (
      !(error instanceof ForbiddenException) &&
      !(error instanceof NotFoundException)
    )
      throw error;
  }
  return {
    id: row.id,
    contractId: contract.id,
    contractVersionId: version.id,
    versionNumber: version.versionNumber,
    revision: row.resultRevision,
    evidenceKind: 'DECLARED_RECEIVED_PDF' as const,
    provenance: 'COMPANY_MODEL_OFFER' as const,
    provisional: true as const,
    caseAcceptance: 'DECLARED' as const,
    providerSignatory: command.providerSignatory,
    clientSignatory: command.clientSignatory,
    concordanceBasis: command.concordanceBasis,
    acceptanceBasis: command.acceptanceBasis,
    acknowledgedWarningCodes: command.acknowledgedWarningCodes,
    actorWorkspaceMembershipId: row.actorWorkspaceMembershipId,
    actorInternalUserId: row.actorInternalUserId,
    recordedAt: row.recordedAt.toISOString(),
    approvalDecisionId: row.approvalDecisionId,
    representationChecksum: row.representationChecksum,
    qualityRun,
    pdf,
  };
}
export type ReportedSigningDeclaration = NonNullable<
  Awaited<ReturnType<typeof readReportedSigningDeclaration>>
>;
