import type { ActorContext } from '../access/access.types.js';
import type { CompanyPermission } from '../access/captured-company-permissions.js';
import type { CompanyModelAuthority } from '../access/company-model-access.service.js';
import type { AccountabilityService } from '../accountability/accountability.service.js';
import type {
  contractModelCommands,
  contractModelDecisions,
  contractModels,
  contractModelVersions,
  contractModelWithdrawals,
  offerModelCommands,
  offerModelDecisions,
  offerModels,
  offerModelVersions,
  offerModelWithdrawals,
} from '../database/schema/index.js';
import type { CompanyModelFields } from './company-model.fields.js';

/** One kind's own tables: the shared lifecycle never mixes two kinds' rows. */
export type CompanyModelTables =
  | {
      readonly models: typeof offerModels;
      readonly versions: typeof offerModelVersions;
      readonly decisions: typeof offerModelDecisions;
      readonly withdrawals: typeof offerModelWithdrawals;
      readonly commands: typeof offerModelCommands;
    }
  | {
      readonly models: typeof contractModels;
      readonly versions: typeof contractModelVersions;
      readonly decisions: typeof contractModelDecisions;
      readonly withdrawals: typeof contractModelWithdrawals;
      readonly commands: typeof contractModelCommands;
    };

export type ModelRow = CompanyModelTables['models']['$inferSelect'];
export type ModelVersionRow = CompanyModelTables['versions']['$inferSelect'];

/** The fixed fields a model view and its receipts spell before the revision. */
export interface CompanyModelIdentity {
  readonly code: string;
  readonly language: 'ro';
}

/** What every kind's content shows in a version summary. */
export interface CompanyModelContent {
  readonly sourceKind: 'ILLUSTRATIVE' | 'COMPANY_SUPPLIED';
  readonly serviceTitle: string;
}

/** The lifecycle step a restricted model event records. */
export type CompanyModelStep =
  'created' | 'approved' | 'rejected' | 'withdrawn';

export interface CompanyModelEvent {
  readonly actor: ActorContext;
  readonly companyId: string;
  readonly modelId: string;
  readonly versionId: string;
  readonly versionNumber: number;
  readonly revision: number;
  readonly step: CompanyModelStep;
  readonly recordedAt: Date;
}

/**
 * One Company model kind. The lifecycle (submit, decide, withdraw, history,
 * receipts and the selection fence) is shared; a kind supplies its tables,
 * content parser, authority, selection permissions, refusal codes and events.
 */
export interface CompanyModelKind<
  Content extends CompanyModelContent,
  Identity extends CompanyModelIdentity,
  Selection extends string,
> {
  /** The kind's name inside messages, such as `Offer`. */
  readonly noun: string;
  /** The prefix of the kind's refusal codes, such as `OFFER_MODEL`. */
  readonly codePrefix: string;
  /**
   * The first advisory lock part of the kind's commands. Renaming it changes
   * which commands serialize with each other.
   */
  readonly lockName: string;
  readonly identity: Identity;
  readonly tables: CompanyModelTables;
  /** Readers refusing with the kind's own content error. */
  readonly fields: CompanyModelFields;
  /** The member authority that reads, edits and approves the kind. */
  readonly authority: CompanyModelAuthority;
  readonly selection: {
    readonly kind: Selection;
    /** Permissions a generation needs to select the approved Version. */
    readonly permissions: readonly CompanyPermission[];
  };
  readContent(value: unknown): Content;
  /** Records the kind's restricted event inside the command's transaction. */
  recordEvent(
    accountability: AccountabilityService,
    event: CompanyModelEvent,
  ): Promise<void>;
}

/** Infers a kind's literal identity and selection kind from its definition. */
export function companyModelKind<
  Content extends CompanyModelContent,
  const Identity extends CompanyModelIdentity,
  const Selection extends string,
>(
  kind: CompanyModelKind<Content, Identity, Selection>,
): CompanyModelKind<Content, Identity, Selection> {
  return kind;
}
