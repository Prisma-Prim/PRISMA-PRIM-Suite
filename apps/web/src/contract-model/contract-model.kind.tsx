import type { ActorContext } from '../access-types';
import { companyModelAuthority } from '../company-model/company-model-authority';
import type { CompanyModelKind } from '../company-model/company-model-kind';
import {
  CompanyModelWorkspace,
  type CompanyModelWorkspaceProps,
} from '../company-model/CompanyModelWorkspace';
import {
  CONTRACT_MODEL_CODE,
  CONTRACT_MODEL_LANGUAGE,
  readContractModelContent,
  type ContractModelContent,
} from './contract-model-content';
import { useContractModelCopy } from './contract-model.copy';
import { ContractModelBody } from './ContractModelBody';
import {
  ContractModelFields,
  contractModelDraft,
  type ContractModelDraft,
} from './ContractModelFields';

/** The Company Contract model: the consulting Contract structure a Contract copies. */
export const CONTRACT_MODEL = {
  rootClass: 'contract-model-workspace',
  path: '/contract-models/consulting-ro',
  identity: {
    code: CONTRACT_MODEL_CODE,
    kind: 'CONTRACT',
    language: CONTRACT_MODEL_LANGUAGE,
  },
  grants: {
    field: 'contractModelGrants',
    editor: {
      bundle: 'company_contract_model_editor',
      permissions: [
        'commercial.contract.model.read',
        'commercial.contract.model.version.create',
      ],
    },
    approver: {
      bundle: 'company_contract_model_approver',
      permissions: [
        'commercial.contract.model.read',
        'commercial.contract.model.decide',
        'commercial.contract.model.withdraw',
      ],
    },
  },
  readContent: readContractModelContent,
  useCopy: useContractModelCopy,
  useVersionKind: () => useContractModelCopy()('fixedKind'),
  Body: ContractModelBody,
  draft: contractModelDraft,
  Fields: ContractModelFields,
} as const satisfies CompanyModelKind<ContractModelContent, ContractModelDraft>;

export function contractModelAuthority(actor: ActorContext) {
  return companyModelAuthority(actor, CONTRACT_MODEL.grants);
}

export function ContractModelWorkspace(props: CompanyModelWorkspaceProps) {
  return <CompanyModelWorkspace {...props} kind={CONTRACT_MODEL} />;
}
