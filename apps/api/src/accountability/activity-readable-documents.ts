import { and, eq, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { missionDeliverableAssignmentExists } from '../access/mission-deliverable-access.js';
import { receivedContractAssignmentExists } from '../access/received-contract-access.js';
import type { DatabaseContext } from '../database/database-context.js';
import {
  clientAccounts,
  clientCompanyRelationships,
  workingDocuments,
} from '../database/schema/index.js';

/**
 * Lazy, one-row-per-Document qualification for Activity's dated sources.
 * Join all three event scope columns before applying the event page bound.
 * This preserves supplied-Actor admission; only family evidence is read live.
 */
export function activityReadableDocuments({
  actor,
  connection,
}: {
  actor: ActorContext;
  connection: DatabaseContext['connection'];
}) {
  const company = actor.activeCompany;
  if (
    !actor.active ||
    !company?.documentPermissions?.includes('document.read') ||
    (!actor.workspacePermissions.includes('client.manage') &&
      !company.clientPermissions.includes('client.read'))
  )
    return undefined;

  const mission = missionDeliverableAssignmentExists({ actor, connection });
  const received = receivedContractAssignmentExists({ actor, connection });

  return connection
    .select({
      id: workingDocuments.id,
      workspaceId: workingDocuments.workspaceId,
      companyId: workingDocuments.companyId,
      originalClientId: workingDocuments.clientId,
      title: workingDocuments.title,
    })
    .from(workingDocuments)
    .innerJoin(
      clientAccounts,
      and(
        eq(clientAccounts.workspaceId, workingDocuments.workspaceId),
        eq(clientAccounts.id, workingDocuments.clientId),
        sql`${clientAccounts.status} IN ('active','superseded')`,
      ),
    )
    .innerJoin(
      clientCompanyRelationships,
      and(
        eq(
          clientCompanyRelationships.workspaceId,
          workingDocuments.workspaceId,
        ),
        eq(clientCompanyRelationships.companyId, workingDocuments.companyId),
        eq(
          clientCompanyRelationships.clientAccountId,
          workingDocuments.clientId,
        ),
        eq(clientCompanyRelationships.status, 'active'),
      ),
    )
    .where(
      and(
        eq(workingDocuments.workspaceId, actor.workspaceId),
        eq(workingDocuments.companyId, company.id),
        sql`(${eq(workingDocuments.type, 'questionnaire')} OR (${eq(workingDocuments.type, 'mission-deliverable')} AND ${mission}) OR (${eq(workingDocuments.type, 'received-contract')} AND ${received}))`,
      ),
    )
    .as('activity_readable_documents');
}
