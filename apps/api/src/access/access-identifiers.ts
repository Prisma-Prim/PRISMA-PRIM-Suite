import { BadRequestException } from '@nestjs/common';
import type { InternalUserId, WorkspaceId } from './access.types.js';

/** Parse representation at an identity boundary; Access still checks authority. */
export function parseInternalUserId(value: unknown): InternalUserId {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- #1220: parsePersistedUuid validates and normalizes the UUID; this constructor assigns its role, not authority.
  return parsePersistedUuid(value) as InternalUserId;
}

export function parseWorkspaceId(value: unknown): WorkspaceId {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- #1220: parsePersistedUuid validates and normalizes the UUID; this constructor assigns its role, not authority.
  return parsePersistedUuid(value) as WorkspaceId;
}

function parsePersistedUuid(value: unknown): string {
  // Match Access admission and PostgreSQL UUIDs, including existing v7/nil IDs.
  // Request selectors retain their stricter requireUuid validation separately.
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(value)
  )
    throw new BadRequestException('A valid UUID is required.');
  return value.toLowerCase();
}
