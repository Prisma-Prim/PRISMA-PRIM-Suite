import type { PublishPricingRuleVersionCommand } from './pricing-configuration.types.js';
import {
  readEffectiveWindow,
  readExpectedActiveVersionNumber,
  readPublicationBody,
  readVersionText,
} from './effective-dated-version.validation.js';

// The label length is a provisional drafting choice (PRD section 13, row 19),
// not an approved business limit. Every other version field is server-owned.
const PUBLICATION_FIELDS: ReadonlySet<string> = new Set([
  'label',
  'effectiveFrom',
  'effectiveTo',
  'expectedActiveVersionNumber',
]);
const LABEL_MAXIMUM = 120;

export function readPublishPricingRuleVersionCommand(
  value: unknown,
): PublishPricingRuleVersionCommand {
  const body = readPublicationBody(value, {
    field: 'ruleVersion',
    fields: PUBLICATION_FIELDS,
    message: 'Enter a valid Pricing Rule Version.',
  });
  const label = readVersionText(body.label, {
    field: 'label',
    maximum: LABEL_MAXIMUM,
    nullMessage: 'Remove the null character from the label.',
  });
  const { effectiveFrom, effectiveTo } = readEffectiveWindow(body);
  return {
    label,
    effectiveFrom,
    effectiveTo,
    expectedActiveVersionNumber: readExpectedActiveVersionNumber(
      body.expectedActiveVersionNumber,
      'Reload the Pricing Rule Versions before publishing.',
    ),
  };
}
