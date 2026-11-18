import type { APIRequestContext } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { prepareCombinedAudit } from './combined-audit-qualification.fixture';
import { parseCaseDetail } from '../src/certification/certification-response';
import { combinedCertificatePdf } from '../../api/test-support/combined-audit-pdf.fixture.mjs';
import { certificationMembers } from './certification-journey.acceptance.fixture';

export async function preparePilotDossier(
  request: APIRequestContext,
  suffix: string,
) {
  const specimen = await prepareCombinedAudit(request, suffix);
  const parts = {
    '[Content_Types].xml':
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="root" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml':
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      [
        'DOSAR FICTIV / УЧЕБНЫЙ ПРИМЕР',
        'Denumire juridică: Lactis Demo SRL',
        'Адрес: Str. Exemplu 1, Demo City',
        'Domeniu: Producerea laptelui pasteurizat (exemplu)',
        'Cod fiscal: RO87654321',
      ]
        .map((line) => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`)
        .join('') +
      '</w:body></w:document>',
  };
  return {
    ...specimen,
    docx: Buffer.from(
      zipSync(
        Object.fromEntries(
          Object.entries(parts).map(([name, value]) => [name, strToU8(value)]),
        ),
      ),
    ),
  };
}

/** A fictional external PDF example; the actual native release commands still validate it. */
export async function pilotCertificate(
  request: APIRequestContext,
  specimen: Awaited<ReturnType<typeof preparePilotDossier>>,
  role: keyof typeof certificationMembers,
) {
  const response = await request.get(
    `http://127.0.0.1:4174/api${specimen.base}`,
    {
      headers: {
        ...certificationMembers[role],
        'x-company-context-id': specimen.companyId,
      },
    },
  );
  if (response.status() !== 200)
    throw new Error('Fictional Case is not readable.');
  const detail = parseCaseDetail(await response.json(), {
    companyId: specimen.companyId,
    projectId: specimen.projectId,
    caseId: specimen.caseId,
  });
  const decision = detail.decision?.value;
  const validity = detail.release.validity;
  const agreed = detail.certificateData?.value.texts;
  if (
    !decision ||
    decision.decision !== 'granted' ||
    !validity ||
    !agreed ||
    agreed.length !== 1 ||
    JSON.stringify(agreed) !== JSON.stringify(decision.grantedTexts)
  )
    return null;
  const facts = agreed[0];
  if (!facts) return null;
  const currentDraft = detail.release.drafts.find(
    (version) => version.id === detail.release.currentDraftId,
  );
  return combinedCertificatePdf({
    number:
      detail.certificate?.number ??
      currentDraft?.value.number ??
      `PILOT-${specimen.caseId.slice(0, 8)}`,
    ...facts,
    validFrom: validity.validFrom,
    validUntil: validity.validUntil,
  });
}
