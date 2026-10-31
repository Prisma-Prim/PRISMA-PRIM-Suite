import { defineMessages, useMessages } from '../localization/messages';

const keys = ['emailRequired', 'emailFormat', 'verificationCode'] as const;

export const clerkNativeValidationMessages = defineMessages(keys, {
  ro: {
    verificationCode: 'Introduceți codul de verificare',
    emailRequired: 'Introduceți adresa de email.',
    emailFormat: 'Introduceți o adresă de email validă.',
  },
  ru: {
    verificationCode: 'Введите код подтверждения',
    emailRequired: 'Введите адрес электронной почты.',
    emailFormat: 'Введите корректный адрес электронной почты.',
  },
  fr: {
    verificationCode: 'Saisissez le code de vérification',
    emailRequired: 'Saisissez votre adresse e-mail.',
    emailFormat: 'Saisissez une adresse e-mail valide.',
  },
  en: {
    verificationCode: 'Enter verification code',
    emailRequired: 'Enter your email address.',
    emailFormat: 'Enter a valid email address.',
  },
});

export function useClerkNativeValidationCopy() {
  const t = useMessages(clerkNativeValidationMessages);
  return {
    emailRequired: t('emailRequired'),
    emailFormat: t('emailFormat'),
    verificationCode: t('verificationCode'),
  };
}
