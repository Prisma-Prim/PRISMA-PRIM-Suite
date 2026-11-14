import type { ComponentType } from 'react';
import type { CompanyModelFieldsProps } from './CompanyModelForm';

export type ModelSourceKind = 'ILLUSTRATIVE' | 'COMPANY_SUPPLIED';

/** What the shared lifecycle reads from every kind's literal content. */
export type CompanyModelContentBase = {
  sourceKind: ModelSourceKind;
  serviceTitle: string;
};

/** An editable draft: the content with its source kind possibly unchosen. */
export type CompanyModelDraftBase = { sourceKind: '' | ModelSourceKind };

/** Copy the shared workspace, history, version and form shell display. */
export type CompanyModelCopyKey =
  | 'title'
  | 'description'
  | 'denied'
  | 'refresh'
  | 'loading'
  | 'error'
  | 'empty'
  | 'saving'
  | 'uncertain'
  | 'retry'
  | 'invalid'
  | 'stale'
  | 'saved'
  | 'decisionSaved'
  | 'withdrawalSaved'
  | 'active'
  | 'noActive'
  | 'head'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'basis'
  | 'approve'
  | 'reject'
  | 'withdraw'
  | 'withdrawReason'
  | 'withdrawn'
  | 'newVersion'
  | 'copyHead'
  | 'copyVersion'
  | 'history'
  | 'openVersion'
  | 'more'
  | 'unavailable'
  | 'historical'
  | 'closeVersion'
  | 'version'
  | 'createdBy'
  | 'decidedBy'
  | 'withdrawnBy'
  | 'formHelp'
  | 'sourceKind'
  | 'chooseSource'
  | 'submit'
  | 'cancel'
  | 'frameworks'
  | 'frameworkName'
  | 'frameworkEdition'
  | 'addFramework'
  | 'removeFramework'
  | 'plannedStages'
  | 'stage'
  | 'stageTitle'
  | 'plannedActivity'
  | 'intendedResult'
  | ModelSourceKind;
export type CompanyModelCopy = (key: CompanyModelCopyKey) => string;

type ModelBundle = Readonly<{
  bundle: string;
  permissions: readonly string[];
}>;
/** The Actor projection field and the two bundles that admit a kind. */
export type CompanyModelGrants = Readonly<{
  field: 'offerModelGrants' | 'contractModelGrants';
  editor: ModelBundle;
  approver: ModelBundle;
}>;

/**
 * One Company model kind: everything the shared lifecycle cannot know.
 * Routes, grants and the model identity mirror the API kind byte for byte.
 */
export type CompanyModelKind<
  Content extends CompanyModelContentBase,
  Draft extends CompanyModelDraftBase,
> = Readonly<{
  /** Class of the workspace root, kept as the journeys' kind-specific hook. */
  rootClass: string;
  /** The model root route, without the `/api` prefix. */
  path: string;
  /** Fixed identity fields the model response must carry exactly. */
  identity: Readonly<Record<string, string>>;
  grants: CompanyModelGrants;
  readContent: (value: unknown) => Content;
  useCopy: () => CompanyModelCopy;
  /** The fixed kind and language line of an exact version. */
  useVersionKind: () => string;
  Body: ComponentType<{ content: Content }>;
  draft: (initial: Content | null) => Draft;
  Fields: ComponentType<CompanyModelFieldsProps<Draft>>;
}>;
