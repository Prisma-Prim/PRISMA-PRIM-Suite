import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';
import type { ProjectResponsibilityCommand } from './project-responsibility.types.js';

const MAX_REVISION = 2147483647;

/** The HTTP body is the boundary: exactly an observed revision and a target or null. */
export function responsibilityCommand(
  value: unknown,
): ProjectResponsibilityCommand {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2 ||
    !('expectedRevision' in value) ||
    !('workspaceMembershipId' in value)
  )
    throw new BadRequestException(
      'An observed revision and a responsible member or null are required.',
    );
  const { expectedRevision, workspaceMembershipId } = value;
  if (
    typeof expectedRevision !== 'number' ||
    !Number.isInteger(expectedRevision) ||
    expectedRevision < 0 ||
    expectedRevision > MAX_REVISION
  )
    throw new BadRequestException('A valid observed revision is required.');
  return {
    expectedRevision,
    workspaceMembershipId:
      workspaceMembershipId === null
        ? null
        : requireUuid(workspaceMembershipId),
  };
}
