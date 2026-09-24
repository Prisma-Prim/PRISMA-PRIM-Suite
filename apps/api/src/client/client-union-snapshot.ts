import { NotFoundException } from '@nestjs/common';
import {
  clientAccounts,
  clientCompanyRelationships,
} from '../database/schema/index.js';
import {
  isStoredClientContact,
  normalizeRegistration,
} from './client-dossier-validation.js';
import { unionRecord } from './client-union-validation.js';

type ClientRow = typeof clientAccounts.$inferSelect;
type RelationshipRow = typeof clientCompanyRelationships.$inferSelect;
export type UnionClientSnapshot = Omit<ClientRow, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};
export type UnionRelationshipSnapshot = Omit<RelationshipRow, 'createdAt'> & {
  createdAt: string;
  rowVersion: string;
};
export interface UnionSnapshot {
  clients: UnionClientSnapshot[];
  relationships: UnionRelationshipSnapshot[];
  companies: {
    id: string;
    displayName: string;
    status: 'active' | 'inactive';
    rowVersion: string;
  }[];
}

function strings(record: Record<string, unknown>, keys: readonly string[]) {
  return keys.every((key) => typeof record[key] === 'string');
}

function isClient(value: unknown): value is UnionClientSnapshot {
  try {
    const input = unionRecord(value);
    if (
      !strings(input, [
        'id',
        'workspaceId',
        'displayName',
        'createdAt',
        'updatedAt',
        'createdByInternalUserId',
        'createdByWorkspaceMembershipId',
      ])
    )
      return false;
    if (
      ![
        'taxId',
        'address',
        'telephone',
        'generalEmail',
        'businessActivity',
      ].every((key) => input[key] === null || typeof input[key] === 'string')
    )
      return false;
    if (
      typeof input.version !== 'number' ||
      !Number.isInteger(input.version) ||
      input.version < 1 ||
      input.version > 2147483647
    )
      return false;
    if (
      input.status !== 'active' &&
      input.status !== 'archived' &&
      input.status !== 'superseded'
    )
      return false;
    normalizeRegistration({
      displayName: input.displayName,
      taxId: input.taxId,
      address: input.address,
      telephone: input.telephone,
      generalEmail: input.generalEmail,
      contacts: input.contacts,
      businessActivity: input.businessActivity,
    });
    return (
      Array.isArray(input.contacts) &&
      input.contacts.every(isStoredClientContact)
    );
  } catch {
    return false;
  }
}

function isRelationship(value: unknown): value is UnionRelationshipSnapshot {
  try {
    const input = unionRecord(value);
    return (
      strings(input, [
        'id',
        'workspaceId',
        'clientAccountId',
        'companyId',
        'createdAt',
        'createdByInternalUserId',
        'createdByWorkspaceMembershipId',
        'rowVersion',
      ]) &&
      (input.status === 'active' || input.status === 'archived')
    );
  } catch {
    return false;
  }
}

function isCompany(
  value: unknown,
): value is UnionSnapshot['companies'][number] {
  try {
    const input = unionRecord(value);
    return (
      strings(input, ['id', 'displayName', 'rowVersion']) &&
      (input.status === 'active' || input.status === 'inactive')
    );
  } catch {
    return false;
  }
}

export function readUnionSnapshot(value: unknown): UnionSnapshot {
  const input = unionRecord(value);
  if (
    !Array.isArray(input.clients) ||
    !input.clients.every(isClient) ||
    !Array.isArray(input.relationships) ||
    !input.relationships.every(isRelationship) ||
    !Array.isArray(input.companies) ||
    !input.companies.every(isCompany)
  ) {
    throw new NotFoundException();
  }
  return {
    clients: input.clients,
    relationships: input.relationships,
    companies: input.companies,
  };
}

export function snapshotClient(row: ClientRow): UnionClientSnapshot {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function snapshotRelationship(
  row: RelationshipRow,
  rowVersion: string,
): UnionRelationshipSnapshot {
  return { ...row, createdAt: row.createdAt.toISOString(), rowVersion };
}

export function dossierFields(client: UnionClientSnapshot) {
  return {
    displayName: client.displayName,
    taxId: client.taxId,
    address: client.address,
    telephone: client.telephone,
    generalEmail: client.generalEmail,
    businessActivity: client.businessActivity,
    contacts: client.contacts,
  };
}

export function comparisonClient(client: UnionClientSnapshot) {
  return { id: client.id, version: client.version, ...dossierFields(client) };
}
