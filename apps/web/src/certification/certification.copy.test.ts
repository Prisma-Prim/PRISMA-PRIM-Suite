import { describe, expect, it } from 'vitest';
import {
  interfaceLocales,
  type InterfaceLocale,
} from '../localization/interface-locale';
import { resolveMessage } from '../localization/messages';
import {
  certificationMessages,
  type CertificationMessageKey,
} from './certification.copy';

/**
 * How each language names the Case's attached PDFs (the document archive) and
 * the generated, non-official PDF (the dossier register): Certification Case
 * PRD §6 story 16 and §12.
 */
const NAMES = {
  en: { archive: /document archive/iu, register: /dossier register/iu },
  fr: { archive: /registre des pièces/iu, register: /registre du dossier/iu },
  ro: {
    archive: /registrul documentelor/iu,
    register: /registrul dosarului/iu,
  },
  ru: {
    archive: /реестр\p{L}* документов/iu,
    register: /реестр\p{L}* досье/iu,
  },
} satisfies Record<InterfaceLocale, { archive: RegExp; register: RegExp }>;

/** The messages that refer the reader to the attached PDFs. */
const ARCHIVE_KEYS = [
  'documentsTitle',
  'agreementHelp',
  'agreementNoDocument',
  'stageNoPlanDocument',
  'stageNoReportDocument',
  'findingNoEvidenceDocument',
  'dossierReviewHelp',
] as const satisfies readonly CertificationMessageKey[];

/** The messages that name the generated PDF. */
const REGISTER_KEYS = [
  'registerPdfTitle',
  'registerPdfDownload',
  'registerPdfDownloading',
  'registerPdfFailed',
] as const satisfies readonly CertificationMessageKey[];

/** The keys whose message does not name `expected`, or also names `other`. */
function misnamed(
  locale: InterfaceLocale,
  keys: readonly CertificationMessageKey[],
  { expected, other }: { expected: RegExp; other: RegExp },
) {
  return keys.filter((key) => {
    const message = resolveMessage(certificationMessages, locale, key);
    return !expected.test(message) || other.test(message);
  });
}

describe('Certification copy', () => {
  it.each(interfaceLocales)(
    'keeps one name for the attached PDFs and another for the generated dossier register (%s)',
    (locale) => {
      const { archive, register } = NAMES[locale];
      expect(
        misnamed(locale, ARCHIVE_KEYS, { expected: archive, other: register }),
      ).toEqual([]);
      expect(
        misnamed(locale, REGISTER_KEYS, { expected: register, other: archive }),
      ).toEqual([]);
    },
  );
});
