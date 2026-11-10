import { BadRequestException } from '@nestjs/common';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  parseInternalUserId,
  parseWorkspaceId,
  parseCompanyId,
  parseWorkspaceMembershipId,
} from './access-identifiers.js';
import type { ActiveAuthoritySelection, ActorContext } from './access.types.js';

describe('Access identity boundaries', () => {
  it('prevents an Internal User and Workspace from being interchanged', () => {
    expectTypeOf<ActorContext['internalUserId']>().not.toMatchTypeOf<
      ActorContext['workspaceId']
    >();
    expectTypeOf<ActorContext['workspaceId']>().not.toMatchTypeOf<
      ActorContext['internalUserId']
    >();
    expectTypeOf<{
      internalUserId: ActorContext['workspaceId'];
      workspaceId: ActorContext['internalUserId'];
    }>().not.toMatchTypeOf<ActiveAuthoritySelection>();
    expectTypeOf<{
      internalUserId: string;
      workspaceId: string;
    }>().not.toMatchTypeOf<ActiveAuthoritySelection>();
    expectTypeOf({
      internalUserId: parseInternalUserId(
        '11111111-1111-4111-8111-111111111111',
      ),
      workspaceId: parseWorkspaceId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    }).toMatchTypeOf<ActiveAuthoritySelection>();
    expectTypeOf({
      internalUserId: parseInternalUserId(
        '11111111-1111-4111-8111-111111111111',
      ),
    }).toMatchTypeOf<ActiveAuthoritySelection>();
  });

  it.each([
    parseInternalUserId,
    parseWorkspaceId,
    parseCompanyId,
    parseWorkspaceMembershipId,
  ])(
    '%s validates and normalizes UUIDs without changing their string transport',
    (parse) => {
      const id = parse('AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA');
      expect(id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      expect(JSON.stringify({ id })).toBe(
        '{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',
      );
    },
  );

  it.each([
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa',
  ])('preserves persisted UUID representation %s', (value) => {
    expect(parseInternalUserId(value)).toBe(value);
    expect(parseWorkspaceId(value)).toBe(value);
    expect(parseCompanyId(value)).toBe(value);
    expect(parseWorkspaceMembershipId(value)).toBe(value);
  });

  it.each([
    undefined,
    null,
    1,
    {},
    [],
    '',
    'not-a-uuid',
    ' aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa',
  ])('rejects an invalid identifier %j at construction', (value) => {
    expect(() => parseInternalUserId(value)).toThrow(BadRequestException);
    expect(() => parseWorkspaceId(value)).toThrow(BadRequestException);
    expect(() => parseCompanyId(value)).toThrow(BadRequestException);
    expect(() => parseWorkspaceMembershipId(value)).toThrow(
      BadRequestException,
    );
  });
});
