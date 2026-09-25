import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { responsibilityCommand } from './project-responsibility.validation.js';

const member = '0B6A1F4E-5C3D-4E2F-8A1B-9C8D7E6F5A4B';

describe('Project responsibility command', () => {
  it.each([
    [
      { expectedRevision: 0, workspaceMembershipId: member },
      { expectedRevision: 0, workspaceMembershipId: member.toLowerCase() },
    ],
    [
      { expectedRevision: 2147483647, workspaceMembershipId: null },
      { expectedRevision: 2147483647, workspaceMembershipId: null },
    ],
  ])('accepts a set or clear with its observed revision', (body, expected) => {
    expect(responsibilityCommand(body)).toEqual(expected);
  });

  it.each([
    undefined,
    null,
    [],
    'set',
    {},
    { expectedRevision: 0 },
    { workspaceMembershipId: member },
    { expectedRevision: 0, workspaceMembershipId: undefined },
    { expectedRevision: -1, workspaceMembershipId: member },
    { expectedRevision: 1.5, workspaceMembershipId: member },
    { expectedRevision: '1', workspaceMembershipId: member },
    { expectedRevision: 2147483648, workspaceMembershipId: member },
    { expectedRevision: 0, workspaceMembershipId: 'member' },
    { expectedRevision: 0, workspaceMembershipId: '' },
    { expectedRevision: 0, workspaceMembershipId: member, companyId: member },
    { expectedRevision: 0, workspaceMembershipId: member, displayLabel: 'Ion' },
  ])('rejects a malformed command: %j', (body) => {
    expect(() => responsibilityCommand(body)).toThrow(BadRequestException);
  });
});
