import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import {
  isNativeAccessFamily,
  requiresNativeFamilyAccess,
  type DocumentFamilyAction,
  type DocumentType,
  type NativeAccessDocumentType,
} from './document-family-policy.js';

type NativeGrant = (
  actor: ActorContext,
  options: { action: DocumentFamilyAction; lockAssignment: boolean },
) => Promise<string>;

type FamilyVisibility = (
  actor: ActorContext,
  lock: boolean,
) => Promise<boolean>;

/**
 * The family-dependent authority of every Document read and command. Callers
 * keep the delivered Document authority; this module adds what the family
 * policy decides, so a read, a pre-body check and the in-transaction recheck
 * of one action can never consult different family rules (#1176).
 */
@Injectable()
export class DocumentFamilyAccess {
  constructor(private readonly authorization: CompanyContextAuthorization) {}

  private readonly nativeGrants: Record<NativeAccessDocumentType, NativeGrant> =
    {
      'received-addendum': (actor, options) =>
        this.authorization.requireReceivedAddendumNativeAccess(actor, options),
      'received-audit-source': (actor, options) =>
        this.authorization.requireReceivedAuditSourceNativeAccess(
          actor,
          options,
        ),
      'external-invoice': (actor, options) =>
        this.authorization.requireExternalInvoiceNativeAccess(actor, options),
      'payment-evidence': (actor, options) =>
        this.authorization.requirePaymentEvidenceNativeAccess(actor, options),
    };

  /** Whether the family is visible at all; a commanding read also locks it. */
  private readonly visibility: Record<DocumentType, FamilyVisibility> = {
    questionnaire: () => Promise.resolve(true),
    'mission-deliverable': (actor, lock) =>
      this.authorization.hasPermissions(actor, {
        permissions: ['document.mission_deliverable.access'],
        lock: {
          lockAssignment: lock,
        }.lockAssignment,
      }),
    'received-contract': (actor, lock) =>
      this.authorization.hasPermissions(actor, {
        permissions: ['document.received_contract.access'],
        lock: {
          lockAssignment: lock,
        }.lockAssignment,
      }),
    'received-addendum': (actor, lock) =>
      this.authorization.hasReceivedAddendumAccess(actor, {
        lockAssignment: lock,
      }),
    'received-audit-source': (actor, lock) =>
      this.authorization.hasReceivedAuditSourceAccess(actor, {
        lockAssignment: lock,
      }),
    'external-invoice': (actor, lock) =>
      this.authorization.hasExternalInvoiceAccess(actor, {
        manage: lock,
        lockAssignment: lock,
      }),
    'payment-evidence': (actor, lock) =>
      this.authorization.hasPaymentEvidenceAccess(actor, {
        manage: lock,
        lockAssignment: lock,
      }),
  };

  /**
   * A hidden family is answered exactly like a missing Document; a visible
   * one still needs the family's read decision.
   */
  async requireVisibleFamily(
    actor: ActorContext,
    type: DocumentType,
    options: { lock: boolean },
  ): Promise<void> {
    if (!(await this.visibility[type](actor, options.lock)))
      throw new NotFoundException();
    await this.requireFamilyAccess(actor, type, 'read', options);
  }

  /** Refuses with 403 when the family's decision for the action is unmet. */
  async requireFamilyAccess(
    actor: ActorContext,
    type: DocumentType,
    action: DocumentFamilyAction,
    options: { lock: boolean },
  ): Promise<void> {
    if (
      !requiresNativeFamilyAccess(type, action) ||
      !isNativeAccessFamily(type)
    )
      return;
    await this.nativeGrants[type](actor, {
      action,
      lockAssignment: options.lock,
    });
  }

  /** The same unlocked decision as a boolean, for projections that withhold facts. */
  async hasFamilyAccess(
    actor: ActorContext,
    type: DocumentType,
    action: DocumentFamilyAction,
  ): Promise<boolean> {
    try {
      await this.requireFamilyAccess(actor, type, action, { lock: false });
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) return false;
      throw error;
    }
  }
}
