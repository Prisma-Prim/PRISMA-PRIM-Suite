import { BadRequestException } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import { exactRecord } from '../contract-model/contract-model.content.js';
import type { OfferRecipientCopy } from '../offer/offer.types.js';
import type {
  ContractQualityEvaluation,
  ContractQualityResult,
} from './contract-quality.js';
import {
  MODEL_CONTRACT_MARKER,
  type ModelContractOfferSource,
} from './model-contract-representation.js';
import type { storedModelContractSnapshot } from './model-contract-snapshot.js';

export const MODEL_CONTRACT_QUALITY_RULES = {
  SOURCE_COMPANY_MATCHES: 'ERROR',
  PARTY_AVAILABLE: 'ERROR',
  PARTY_MATCHES_SOURCE: 'ERROR',
  PARTY_TAX_ID_RECORDED: 'ERROR',
  PARTY_IDENTITY_MATCHES_SOURCE: 'WARNING',
  PARTY_IDENTITY_CURRENT: 'WARNING',
  ISSUER_MATCHES_SOURCE: 'ERROR',
  SERVICE_MATCHES_SOURCE: 'ERROR',
  FINANCIALS_MATCH_SOURCE: 'ERROR',
  CONDITIONS_MATCH_SOURCE: 'ERROR',
  SOURCE_OFFER_READY: 'ERROR',
  MODEL_APPROVAL_PRESERVED: 'ERROR',
  MODEL_WORDING_REVIEWED: 'WARNING',
  ANNEX_SCOPE_REVIEWED: 'WARNING',
  ADDED_CONDITIONS_CONFIRMED: 'WARNING',
  TERM_END_NOT_PASSED: 'WARNING',
  PROVISIONAL_MARKER_PRESENT: 'ERROR',
} satisfies Record<string, 'ERROR' | 'WARNING'>;
export type ModelContractQualityCode =
  keyof typeof MODEL_CONTRACT_QUALITY_RULES;

export function evaluateModelContractQuality(input: {
  snapshot: ReturnType<typeof storedModelContractSnapshot>;
  companyId: string;
  recipient: OfferRecipientCopy;
  currentSource: ModelContractOfferSource;
  sourceReady: boolean;
  partyAvailable: boolean;
  identityCurrent: boolean;
  instant: Date;
}): ContractQualityEvaluation {
  const { snapshot, recipient, currentSource, instant } = input;
  const model = snapshot.modelSource;
  const results: ContractQualityResult[] = [];
  const check = (code: ModelContractQualityCode, pass: boolean) =>
    results.push({
      code,
      status: pass ? 'PASS' : MODEL_CONTRACT_QUALITY_RULES[code],
    });
  check(
    'SOURCE_COMPANY_MATCHES',
    snapshot.offerSource.companyId === input.companyId &&
      currentSource.companyId === input.companyId,
  );
  check('PARTY_AVAILABLE', input.partyAvailable);
  check(
    'PARTY_MATCHES_SOURCE',
    recipient.kind === currentSource.recipient.kind &&
      (recipient.kind === 'PRIMARY' ||
        (currentSource.recipient.kind === 'ADDITIONAL' &&
          recipient.additionalLegalEntityId ===
            currentSource.recipient.additionalLegalEntityId)),
  );
  check(
    'PARTY_TAX_ID_RECORDED',
    recipient.taxId !== null && recipient.taxId.trim().length > 0,
  );
  check(
    'PARTY_IDENTITY_MATCHES_SOURCE',
    recipient.legalName === currentSource.recipient.legalName &&
      recipient.taxId === currentSource.recipient.taxId &&
      recipient.legalAddress === currentSource.recipient.legalAddress,
  );
  check('PARTY_IDENTITY_CURRENT', input.identityCurrent);
  check(
    'ISSUER_MATCHES_SOURCE',
    model.content.issuer.legalName === currentSource.model.issuer.legalName &&
      model.content.issuer.taxId === currentSource.model.issuer.taxId &&
      model.content.issuer.legalAddress ===
        currentSource.model.issuer.legalAddress,
  );
  check(
    'SERVICE_MATCHES_SOURCE',
    model.content.serviceTitle === currentSource.model.serviceTitle &&
      isDeepStrictEqual(
        model.content.frameworks,
        currentSource.model.frameworks,
      ),
  );
  check(
    'FINANCIALS_MATCH_SOURCE',
    isDeepStrictEqual(snapshot.financials, currentSource.financials),
  );
  check(
    'CONDITIONS_MATCH_SOURCE',
    snapshot.offerSource.scopeNote === currentSource.scopeNote &&
      snapshot.offerSource.commercialConditions ===
        currentSource.commercialConditions,
  );
  check('SOURCE_OFFER_READY', input.sourceReady);
  check(
    'MODEL_APPROVAL_PRESERVED',
    model.kind === 'APPROVED_COMPANY_CONTRACT_MODEL' &&
      model.approvalDecisionId.length > 0,
  );
  check('MODEL_WORDING_REVIEWED', false);
  check('ANNEX_SCOPE_REVIEWED', false);
  check(
    'ADDED_CONDITIONS_CONFIRMED',
    snapshot.caseDetails.specialConditions === null &&
      snapshot.caseDetails.termStartsOn === null &&
      snapshot.caseDetails.termEndsOn === null,
  );
  check(
    'TERM_END_NOT_PASSED',
    snapshot.caseDetails.termEndsOn === null ||
      snapshot.caseDetails.termEndsOn >= instant.toISOString().slice(0, 10),
  );
  check(
    'PROVISIONAL_MARKER_PRESENT',
    snapshot.representation.html.includes(MODEL_CONTRACT_MARKER),
  );
  return {
    ruleSet: 'CONTRACT_QUALITY_COMPANY_MODEL',
    ruleSetVersion: 1,
    evaluatedAt: instant,
    results,
  };
}

export function readModelContractQualityResults(
  value: unknown,
): ContractQualityResult[] {
  if (
    !Array.isArray(value) ||
    value.length !== Object.keys(MODEL_CONTRACT_QUALITY_RULES).length
  )
    throw new Error('Invalid stored model Contract check results.');
  const codes = Object.keys(MODEL_CONTRACT_QUALITY_RULES);
  return value.map((entry: unknown, index) => {
    const item = exactRecord(entry, ['code', 'status']);
    if (
      typeof item.code !== 'string' ||
      !isCode(item.code) ||
      item.code !== codes[index] ||
      (item.status !== 'PASS' &&
        item.status !== MODEL_CONTRACT_QUALITY_RULES[item.code]) ||
      ((item.code === 'MODEL_WORDING_REVIEWED' ||
        item.code === 'ANNEX_SCOPE_REVIEWED') &&
        item.status !== 'WARNING')
    )
      throw new Error('Invalid stored model Contract check result.');
    return {
      code: item.code,
      status:
        item.status === 'PASS'
          ? 'PASS'
          : MODEL_CONTRACT_QUALITY_RULES[item.code],
    };
  });
}
export function readModelContractWarningCodes(
  value: unknown,
): ModelContractQualityCode[] {
  if (
    !Array.isArray(value) ||
    value.length > Object.keys(MODEL_CONTRACT_QUALITY_RULES).length
  )
    throw invalidWarnings();
  const result: ModelContractQualityCode[] = [];
  for (const code of value) {
    if (
      typeof code !== 'string' ||
      !isCode(code) ||
      MODEL_CONTRACT_QUALITY_RULES[code] !== 'WARNING' ||
      result.includes(code)
    )
      throw invalidWarnings();
    result.push(code);
  }
  return result;
}
function isCode(value: string): value is ModelContractQualityCode {
  return Object.hasOwn(MODEL_CONTRACT_QUALITY_RULES, value);
}
function invalidWarnings() {
  return new BadRequestException({
    code: 'INVALID_CONTRACT_INPUT',
    field: 'acknowledgedWarningCodes',
  });
}
