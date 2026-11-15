import type { ApiRequest, ApiResult } from '../api/authenticated-api-client';
import { isCompanyGrants } from './company-grants';

type Guard<T> = (value: unknown) => value is T;
type Value<T> = T extends Guard<infer Result> ? Result : never;
type OptionalKeys<S> = {
  [K in keyof S]: undefined extends Value<S[K]> ? K : never;
}[keyof S];
type Simplify<T> = { [K in keyof T]: T[K] };
type ObjectValue<S> = Simplify<
  { -readonly [K in Exclude<keyof S, OptionalKeys<S>>]: Value<S[K]> } & {
    -readonly [K in OptionalKeys<S>]?: Value<S[K]>;
  }
>;

function object<const S extends Record<string, Guard<unknown>>>(
  shape: S,
): Guard<ObjectValue<S>> {
  return (value): value is ObjectValue<S> => {
    if (!isRecord(value)) return false;
    for (const key in shape) {
      const check = shape[key];
      if (check === undefined || !check(value[key])) return false;
    }
    return true;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isString(value: unknown): value is string {
  return typeof value === 'string';
}
function isTrue(value: unknown): value is true {
  return value === true;
}
function isOpaque(value: unknown): value is unknown {
  // Unknown captures have no representation claim at this boundary.
  void value;
  return true;
}
function literal<const T extends string[]>(...values: T): Guard<T[number]> {
  return (value): value is T[number] =>
    typeof value === 'string' && values.some((expected) => expected === value);
}
function array<T>(check: Guard<T>): Guard<T[]> {
  return (value): value is T[] => {
    if (!Array.isArray(value)) return false;
    const items: unknown[] = value;
    for (const item of items) if (!check(item)) return false;
    return true;
  };
}
function optional<T>(check: Guard<T>): Guard<T | undefined> {
  return (value): value is T | undefined => value === undefined || check(value);
}
// This representation contract derives the public type. Feature-owned opaque
// captures are preserved; their authority is interpreted at the feature boundary.
const isActorContext = object({
  internalUserId: isString,
  workspaceMembershipId: isString,
  workspaceId: isString,
  workspaceName: isString,
  displayName: isString,
  email: isString,
  active: isTrue,
  workspacePermissions: array(
    literal(
      'company.manage',
      'company.assignment.manage',
      'client.manage',
      'member.invite',
    ),
  ),
  activeCompany: optional(
    object({
      id: isString,
      displayName: isString,
      grants: isCompanyGrants,
      paymentObservationReadCapture: optional(isOpaque),
      paymentObservationContextCapture: optional(isOpaque),
      paymentEvidenceContextCapture: optional(isOpaque),
      paymentEvidenceReferenceReadCapture: optional(isOpaque),
      invoiceRecordReadCapture: optional(isOpaque),
      offerMessageReadCapture: optional(isOpaque),
      opportunityFollowUpReadCapture: optional(isOpaque),
      workingEvidenceClientReadCapture: optional(isOpaque),
      workingEvidenceContextCapture: optional(isOpaque),
      receivedAddendumClientReadCapture: optional(isOpaque),
    }),
  ),
});

export type ActorContext = Value<typeof isActorContext>;
type CurrentActorSelection = Pick<ApiRequest, 'companyContextId' | 'signal'>;

type CurrentActorTransport = {
  request(
    path: '/access/current-actor',
    request: CurrentActorSelection,
  ): Promise<ApiResult<unknown>>;
};

/** Readable representation proves no live authority beyond the server response. */
export async function readCurrentActor({
  api,
  companyContextId,
  signal,
}: CurrentActorSelection & {
  api: CurrentActorTransport;
}): Promise<ApiResult<ActorContext>> {
  const result = await api.request('/access/current-actor', {
    companyContextId,
    signal,
  });
  if (result.status !== 'ok') return result;
  // Additive fields remain opaque; required grants are validated as one list.
  return isActorContext(result.value)
    ? { status: 'ok', value: result.value }
    : { status: 'error' };
}
