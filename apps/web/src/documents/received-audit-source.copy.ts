import { defineMessages, useMessages } from '../localization/messages';
export const receivedAuditSourceMessages = defineMessages(
  ['family', 'draft', 'official', 'warning'] as const,
  {
    en: {
      family: 'Received Audit source PDF',
      draft: 'Received source draft · Company-confidential',
      official: 'Frozen received source · Company-confidential',
      warning:
        'Preserved received original. Native designation freezes content; it does not approve evidence, a Plan, a Report or a professional decision.',
    },
    ro: {
      family: 'Sursă de Audit primită PDF',
      draft: 'Sursă primită în ciornă · Confidențial companiei',
      official: 'Sursă primită înghețată · Confidențial companiei',
      warning:
        'Original primit păstrat. Desemnarea nativă fixează conținutul; nu aprobă probe, un Plan, un Raport sau o decizie profesională.',
    },
    fr: {
      family: 'Source d’Audit reçue PDF',
      draft: 'Source reçue en brouillon · Confidentiel société',
      official: 'Source reçue figée · Confidentiel société',
      warning:
        'Original reçu conservé. La désignation native fige le contenu ; elle n’approuve ni preuve, Plan, Rapport ou décision professionnelle.',
    },
    ru: {
      family: 'Полученный источник Аудита PDF',
      draft: 'Черновик полученного источника · Конфиденциально компании',
      official:
        'Зафиксированный полученный источник · Конфиденциально компании',
      warning:
        'Сохранённый полученный оригинал. Назначение фиксирует содержимое; оно не утверждает доказательства, План, Отчёт или профессиональное решение.',
    },
  },
);
export function useReceivedAuditSourceCopy() {
  return useMessages(receivedAuditSourceMessages);
}
