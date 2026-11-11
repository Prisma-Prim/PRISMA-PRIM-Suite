import { expect } from 'vitest';
import {
  fixtureObjects,
  fixtureString,
} from './external-invoice-migration.test-support.js';

/** Exactly one reviewed policy fragment may change; every surrounding byte remains compared. */
function replacePolicy(body: string, before: string, after: string): string {
  expect(
    body.split(before),
    'Expected the exact previous frozen-PDF policy once.',
  ).toHaveLength(2);
  return body.replace(before, after);
}

const policyUpgrades = new Map<string, (body: string) => string>([
  [
    'invoice_prepare_command()',
    (body) =>
      replacePolicy(
        body,
        "documents_invoice_record_source(NEW.workspace_id,NEW.company_id,root.source_snapshot->'source')",
        "documents_invoice_record_source(NEW.workspace_id,NEW.company_id,root.source_snapshot->'source',false)",
      ),
  ],
  [
    'documents_payment_source(w uuid, c uuid, source jsonb, new_use boolean)',
    (body) => {
      body = replacePolicy(
        body,
        "v.status IN ('official','superseded')",
        'documents_frozen_pdf(v,p)',
      );
      return replacePolicy(
        body,
        " AND p.id=(source->>'representationId')::uuid AND p.scan_outcome='clean' AND p.media_type='application/pdf' AND p.size BETWEEN 1 AND 5242880 AND p.size=octet_length(p.content) AND p.sha256=encode(sha256(p.content),'hex')\n AND NOT EXISTS(SELECT 1 FROM document_pdfs later WHERE (later.workspace_id,later.company_id,later.document_id,later.version_id)=(p.workspace_id,p.company_id,p.document_id,p.version_id) AND later.upload_revision>p.upload_revision)\n",
        " AND p.id=(source->>'representationId')::uuid\n",
      );
    },
  ],
  [
    'validate_reported_contract_signing(target_version_id uuid)',
    (body) =>
      replacePolicy(
        body,
        "p.scan_outcome<>'clean' OR p.upload_revision IS DISTINCT FROM (SELECT max(designated_pdf.upload_revision) FROM document_pdfs designated_pdf WHERE designated_pdf.workspace_id=p.workspace_id AND designated_pdf.company_id=p.company_id AND designated_pdf.document_id=p.document_id AND designated_pdf.version_id=p.version_id) OR dv.status NOT IN ('official','superseded')",
        'NOT documents_frozen_pdf(dv,p)',
      ),
  ],
  [
    'guard_working_evidence_support()',
    (body) =>
      replacePolicy(
        body,
        "v.status NOT IN ('official','superseded') OR p.id IS NULL OR p.scan_outcome<>'clean' OR p.upload_revision<>(SELECT max(x.upload_revision) FROM document_pdfs x WHERE x.workspace_id=p.workspace_id AND x.company_id=p.company_id AND x.document_id=p.document_id AND x.version_id=p.version_id) OR p.sha256<>encode(sha256(p.content),'hex') OR p.size<>octet_length(p.content)",
        'NOT documents_frozen_pdf(v,p)',
      ),
  ],
  [
    'task_result_declaration_guard()',
    (body) => {
      body = replacePolicy(
        body,
        "AND v.id=NEW.version_id AND v.status IN ('official','superseded')",
        'AND v.id=NEW.version_id',
      );
      body = replacePolicy(body, " AND p.scan_outcome='clean'", '');
      return replacePolicy(
        body,
        '      AND p.id=(SELECT current_pdf.id FROM document_pdfs current_pdf\n        WHERE current_pdf.workspace_id=v.workspace_id AND current_pdf.company_id=v.company_id\n          AND current_pdf.document_id=v.document_id AND current_pdf.version_id=v.id\n        ORDER BY current_pdf.upload_revision DESC LIMIT 1)',
        '      AND documents_frozen_pdf(v,p)',
      );
    },
  ],
]);

function definitionParts(definition: string) {
  const opening = 'AS $function$',
    closing = '$function$';
  const start = definition.indexOf(opening),
    end = definition.lastIndexOf(closing);
  if (start < 0 || end <= start)
    throw new Error('Expected a complete native function definition.');
  return {
    header: definition.slice(0, start),
    body: definition.slice(start + opening.length, end),
    footer: definition.slice(end),
  };
}

/**
 * Preserve the predecessor schema assertion, including complete native function
 * bodies. Only the six policy replacements authorized by #1178 are normalized,
 * after proving their exact delta; no function or owner guard is ignored.
 * REST proofs independently exercise the new policy and historical exception.
 */
export function conserveFrozenPdfPolicyUpgrade(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, unknown> {
  const previousFunctions = new Map(
    fixtureObjects(before.functions).map((entry) => [
      fixtureString(entry.name),
      entry,
    ]),
  );
  const currentFunctions = fixtureObjects(after.functions);
  const invoice =
    'documents_invoice_record_source(w uuid, c uuid, source jsonb)';
  const functions = currentFunctions.map((entry) => {
    const name = fixtureString(entry.name),
      previous = previousFunctions.get(name);
    const upgrade = policyUpgrades.get(name);
    if (!previous || (!upgrade && name !== invoice)) return entry;
    const oldDefinition = definitionParts(fixtureString(previous.definition));
    const current = definitionParts(fixtureString(entry.definition));
    expect(current.footer, name).toBe(oldDefinition.footer);
    if (name === invoice) {
      expect(current.header, name).toBe(
        replacePolicy(oldDefinition.header, 'LANGUAGE plpgsql', 'LANGUAGE sql'),
      );
      expect(current.body.trim(), name).toBe(
        'SELECT documents_invoice_record_source(w,c,source,true);',
      );
      const recorded = currentFunctions.find(
        (candidate) =>
          candidate.name ===
          'documents_invoice_record_source(w uuid, c uuid, source jsonb, frozen_use boolean)',
      );
      expect(
        recorded,
        'The strict wrapper must preserve the original guarded qualifier.',
      ).toBeDefined();
      if (!recorded)
        throw new Error('Expected the recorded-source native qualifier.');
      const compatible = definitionParts(fixtureString(recorded.definition));
      expect(
        replacePolicy(compatible.header, ', frozen_use boolean', ''),
        name,
      ).toBe(oldDefinition.header);
      expect(compatible.footer, name).toBe(oldDefinition.footer);
      expect(compatible.body, name).toBe(
        replacePolicy(
          oldDefinition.body,
          "AND p.id=(source->>'representationId')::uuid AND p.scan_outcome='clean'",
          "AND p.id=(source->>'representationId')::uuid AND (NOT frozen_use OR documents_frozen_pdf(v,p)) AND p.scan_outcome='clean'",
        ),
      );
    } else {
      if (!upgrade)
        throw new Error('Expected a closed frozen-PDF policy replacement.');
      expect(current.header, name).toBe(oldDefinition.header);
      expect(current.body, name).toBe(upgrade(oldDefinition.body));
    }
    return previous;
  });
  return { ...after, functions };
}
