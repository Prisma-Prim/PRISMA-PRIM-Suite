import { enUS, frFR, roRO, ruRU } from '@clerk/localizations';
import {
  interfaceLocales,
  type InterfaceLocale,
} from '../localization/interface-locale';
import {
  assertMessageCoverage,
  defineMessages,
  type MessageCatalog,
} from '../localization/messages';
import { clerkNativeValidationMessages } from './clerk-native-validation.copy';

// Email/Google, optional recipient names, and the existing restricted invitation
// composition. Password, phone, MFA, wallets, organizations and billing are absent.
const keys = [
  'formFieldLabel__emailAddress',
  'formFieldInputPlaceholder__emailAddress',
  'formFieldInput__emailAddress_format',
  'formFieldLabel__firstName',
  'formFieldLabel__lastName',
  'formFieldInputPlaceholder__firstName',
  'formFieldInputPlaceholder__lastName',
  'formFieldHintText__optional',
  'formButtonPrimary',
  'formButtonPrimary__verify',
  'dividerText',
  'socialButtonsBlockButton',
  'backButton',
  'footerActionLink__useAnotherMethod',
  'identityPreviewEditButton__identifier',
  'identityPreviewEditButton__emailAddress',
  'signIn.start.title',
  'signIn.start.subtitle',
  'signIn.start.actionText',
  'signIn.start.actionLink',
  'signIn.emailCode.title',
  'signIn.emailCode.subtitle',
  'signIn.emailCode.formTitle',
  'signIn.emailCode.resendButton',
  'signIn.alternativeMethods.title',
  'signIn.alternativeMethods.subtitle',
  'signIn.alternativeMethods.actionText',
  'signIn.alternativeMethods.actionLink',
  'signIn.alternativeMethods.blockButton__emailCode',
  'signIn.alternativeMethods.getHelp.title',
  'signIn.alternativeMethods.getHelp.content',
  'signIn.alternativeMethods.getHelp.blockButton__emailSupport',
  'signUp.start.title',
  'signUp.start.subtitle',
  'signUp.start.actionText',
  'signUp.start.actionLink',
  'signUp.continue.title',
  'signUp.continue.subtitle',
  'signUp.continue.actionText',
  'signUp.continue.actionLink',
  'signUp.restrictedAccess.title',
  'signUp.restrictedAccess.subtitle',
  'signUp.restrictedAccess.actionText',
  'signUp.restrictedAccess.actionLink',
  'signUp.restrictedAccess.blockButton__emailSupport',
  'signUp.emailCode.title',
  'signUp.emailCode.subtitle',
  'signUp.emailCode.formTitle',
  'signUp.emailCode.formSubtitle',
  'signUp.emailCode.resendButton',
  'unstable__errors.form_code_incorrect',
  'unstable__errors.form_param_format_invalid',
  'unstable__errors.form_param_format_invalid__email_address',
  'unstable__errors.form_param_nil',
  'unstable__errors.form_param_type_invalid',
  'unstable__errors.form_param_type_invalid__email_address',
  'unstable__errors.form_param_value_invalid',
  'unstable__errors.form_identifier_not_found',
  'unstable__errors.form_identifier_exists__email_address',
  'unstable__errors.form_email_address_blocked',
  'unstable__errors.not_allowed_access',
  'unstable__errors.captcha_invalid',
  'unstable__errors.captcha_unavailable',
  'unstable__errors.ticket_expired_code',
  'unstable__errors.ticket_invalid_code',
  'unstable__errors.session_exists',
  'unstable__errors.action_blocked',
  'actionBlocked.title',
  'actionBlocked.subtitle',
  'actionBlocked.traceIdLabel',
] as const;

type Key = (typeof keys)[number];
export type ClerkAuthenticationMessages = MessageCatalog<Key>;

export const upstreamClerkLocalizations = {
  ro: roRO,
  ru: ruRU,
  fr: frFR,
  en: enUS,
};

const supplements: Record<InterfaceLocale, Partial<Record<Key, string>>> = {
  ro: {
    identityPreviewEditButton__emailAddress: 'Modificați adresa de email',
    'unstable__errors.form_code_incorrect':
      'Codul introdus nu este corect. Încercați din nou.',
    formFieldInput__emailAddress_format: 'Exemplu de format: nume@exemplu.test',
    identityPreviewEditButton__identifier: 'Modificați adresa de email',
    'unstable__errors.form_param_format_invalid':
      'Verificați formatul câmpului.',
    'unstable__errors.form_param_format_invalid__email_address':
      clerkNativeValidationMessages.translations.ro.emailFormat,
    'unstable__errors.form_param_nil':
      clerkNativeValidationMessages.translations.ro.emailRequired,
    'unstable__errors.form_param_type_invalid': 'Verificați valoarea câmpului.',
    'unstable__errors.form_param_type_invalid__email_address':
      clerkNativeValidationMessages.translations.ro.emailFormat,
    'unstable__errors.form_param_value_invalid':
      'Valoarea introdusă nu este validă.',
    'unstable__errors.form_identifier_not_found':
      'Nu a fost găsit un cont pentru această adresă de email.',
    'unstable__errors.form_identifier_exists__email_address':
      'Există deja un cont cu această adresă de email. Conectați-vă la contul existent.',
    'unstable__errors.form_email_address_blocked':
      'Această adresă de email nu poate fi folosită pentru autentificare.',
    'unstable__errors.not_allowed_access':
      'Accesul la această aplicație nu este permis.',
    'unstable__errors.captcha_invalid':
      'Verificarea de securitate nu a reușit. Încercați din nou.',
    'unstable__errors.captcha_unavailable':
      'Verificarea de securitate nu este disponibilă. Încercați din nou mai târziu.',
    'unstable__errors.ticket_expired_code':
      'Invitația a expirat. Cereți ajutorul persoanei care v-a invitat.',
    'unstable__errors.ticket_invalid_code':
      'Invitația nu este validă. Cereți ajutorul persoanei care v-a invitat.',
    'unstable__errors.session_exists': 'Există deja o sesiune conectată.',
    'unstable__errors.action_blocked':
      'Acțiunea nu poate fi finalizată acum. Încercați din nou mai târziu.',
    'actionBlocked.title': 'Acțiune indisponibilă',
    'actionBlocked.subtitle':
      'Acțiunea nu poate fi finalizată acum. Încercați din nou mai târziu.',
    'actionBlocked.traceIdLabel': 'Referință pentru asistență',
  },
  ru: {
    identityPreviewEditButton__emailAddress: 'Изменить адрес электронной почты',
    'unstable__errors.form_code_incorrect':
      'Введён неверный код. Повторите попытку.',
    formFieldInput__emailAddress_format: 'Пример формата: имя@example.test',
    identityPreviewEditButton__identifier: 'Изменить адрес электронной почты',
    'unstable__errors.form_param_format_invalid': 'Проверьте формат поля.',
    'unstable__errors.form_param_format_invalid__email_address':
      clerkNativeValidationMessages.translations.ru.emailFormat,
    'unstable__errors.form_param_nil':
      clerkNativeValidationMessages.translations.ru.emailRequired,
    'unstable__errors.form_param_type_invalid': 'Проверьте значение поля.',
    'unstable__errors.form_param_type_invalid__email_address':
      clerkNativeValidationMessages.translations.ru.emailFormat,
    'unstable__errors.form_param_value_invalid':
      'Введено некорректное значение.',
    'unstable__errors.form_identifier_not_found':
      'Учётная запись с таким адресом электронной почты не найдена.',
    'unstable__errors.form_identifier_exists__email_address':
      'Учётная запись с этим адресом уже существует. Войдите в существующую запись.',
    'unstable__errors.form_email_address_blocked':
      'Этот адрес электронной почты нельзя использовать для входа.',
    'unstable__errors.not_allowed_access':
      'Доступ к этому приложению не разрешён.',
    'unstable__errors.captcha_invalid':
      'Проверка безопасности не пройдена. Повторите попытку.',
    'unstable__errors.captcha_unavailable':
      'Проверка безопасности недоступна. Повторите попытку позже.',
    'unstable__errors.ticket_expired_code':
      'Срок действия приглашения истёк. Обратитесь к отправителю приглашения.',
    'unstable__errors.ticket_invalid_code':
      'Приглашение недействительно. Обратитесь к отправителю приглашения.',
    'unstable__errors.session_exists': 'Уже существует активный сеанс входа.',
    'unstable__errors.action_blocked':
      'Сейчас действие выполнить нельзя. Повторите попытку позже.',
    'actionBlocked.title': 'Действие недоступно',
    'actionBlocked.subtitle':
      'Сейчас действие выполнить нельзя. Повторите попытку позже.',
    'actionBlocked.traceIdLabel': 'Код для службы поддержки',
  },
  fr: {
    identityPreviewEditButton__emailAddress: 'Modifier l’adresse e-mail',
    'unstable__errors.form_code_incorrect':
      'Le code saisi est incorrect. Réessayez.',
    formFieldInput__emailAddress_format: 'Exemple de format : nom@exemple.test',
    identityPreviewEditButton__identifier: 'Modifier l’adresse e-mail',
    'signIn.start.title': 'Se connecter à {{applicationName}}',
    'unstable__errors.form_param_format_invalid':
      'Vérifiez le format du champ.',
    'unstable__errors.form_param_format_invalid__email_address':
      clerkNativeValidationMessages.translations.fr.emailFormat,
    'unstable__errors.form_param_nil':
      clerkNativeValidationMessages.translations.fr.emailRequired,
    'unstable__errors.form_param_type_invalid': 'Vérifiez la valeur du champ.',
    'unstable__errors.form_param_type_invalid__email_address':
      clerkNativeValidationMessages.translations.fr.emailFormat,
    'unstable__errors.form_param_value_invalid':
      'La valeur saisie n’est pas valide.',
    'unstable__errors.form_identifier_not_found':
      'Aucun compte n’a été trouvé avec cette adresse e-mail.',
    'unstable__errors.form_identifier_exists__email_address':
      'Un compte utilise déjà cette adresse e-mail. Connectez-vous à ce compte.',
    'unstable__errors.form_email_address_blocked':
      'Cette adresse e-mail ne peut pas être utilisée pour se connecter.',
    'unstable__errors.not_allowed_access':
      'L’accès à cette application n’est pas autorisé.',
    'unstable__errors.captcha_invalid':
      'La vérification de sécurité a échoué. Réessayez.',
    'unstable__errors.captcha_unavailable':
      'La vérification de sécurité est indisponible. Réessayez plus tard.',
    'unstable__errors.ticket_expired_code':
      'L’invitation a expiré. Contactez la personne qui vous a invité.',
    'unstable__errors.ticket_invalid_code':
      'L’invitation n’est pas valide. Contactez la personne qui vous a invité.',
    'unstable__errors.session_exists': 'Une session est déjà connectée.',
    'unstable__errors.action_blocked':
      'Cette action est indisponible pour le moment. Réessayez plus tard.',
    'actionBlocked.title': 'Action indisponible',
    'actionBlocked.subtitle':
      'Cette action est indisponible pour le moment. Réessayez plus tard.',
    'actionBlocked.traceIdLabel': 'Référence pour l’assistance',
  },
  en: {
    identityPreviewEditButton__emailAddress: 'Edit email address',
    'unstable__errors.form_code_incorrect':
      'The entered code is incorrect. Please try again.',
    'unstable__errors.form_param_format_invalid':
      'Check the format of this field.',
    'unstable__errors.form_param_format_invalid__email_address':
      clerkNativeValidationMessages.translations.en.emailFormat,
    'unstable__errors.form_param_nil':
      clerkNativeValidationMessages.translations.en.emailRequired,
    'unstable__errors.form_param_type_invalid':
      'Check the value of this field.',
    'unstable__errors.form_param_type_invalid__email_address':
      clerkNativeValidationMessages.translations.en.emailFormat,
    'unstable__errors.form_param_value_invalid':
      'The entered value is not valid.',
    'unstable__errors.form_identifier_not_found':
      'No account was found with this email address.',
    'unstable__errors.form_identifier_exists__email_address':
      'An account already uses this email address. Sign in to the existing account.',
    'unstable__errors.form_email_address_blocked':
      'This email address cannot be used to sign in.',
    'unstable__errors.not_allowed_access':
      'Access to this application is not allowed.',
    'unstable__errors.captcha_invalid':
      'The security check failed. Please try again.',
    'unstable__errors.captcha_unavailable':
      'The security check is unavailable. Please try again later.',
    'unstable__errors.ticket_expired_code':
      'The invitation has expired. Contact the person who invited you.',
    'unstable__errors.ticket_invalid_code':
      'The invitation is not valid. Contact the person who invited you.',
    'unstable__errors.session_exists': 'A session is already signed in.',
    'unstable__errors.action_blocked':
      'This action is unavailable right now. Please try again later.',
    'actionBlocked.title': 'Action unavailable',
    'actionBlocked.subtitle':
      'This action is unavailable right now. Please try again later.',
    'actionBlocked.traceIdLabel': 'Support reference',
  },
};

export function isClerkLocalizationBranch(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function upstreamMessage(resource: unknown, key: Key): string | undefined {
  let value: unknown = resource;
  for (const segment of key.split('.')) {
    if (!isClerkLocalizationBranch(value)) return;
    value = value[segment];
  }
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function translations(locale: InterfaceLocale): Partial<Record<Key, string>> {
  const messages: Partial<Record<Key, string>> = {};
  for (const key of keys) {
    const value =
      supplements[locale][key] ??
      upstreamMessage(upstreamClerkLocalizations[locale], key);
    if (value !== undefined) messages[key] = value;
  }
  return messages;
}

export const clerkAuthenticationMessages = defineMessages(keys, {
  ro: translations('ro'),
  ru: translations('ru'),
  fr: translations('fr'),
  en: translations('en'),
});

const requiredTokens: Partial<Record<Key, readonly string[]>> = {
  socialButtonsBlockButton: ['provider|titleize'],
  'signIn.start.title': ['applicationName'],
  'signIn.emailCode.subtitle': ['applicationName'],
  'signIn.alternativeMethods.blockButton__emailCode': ['identifier'],
};

export function assertClerkAuthenticationCoverage(
  catalog: ClerkAuthenticationMessages = clerkAuthenticationMessages,
): void {
  assertMessageCoverage('clerkAuthentication', catalog);
  for (const locale of interfaceLocales) {
    for (const key of keys) {
      const value = catalog.translations[locale][key];
      if (!value?.trim())
        throw new Error(
          `Empty translation: clerkAuthentication.${locale}.${key}`,
        );
      const tokens = [...value.matchAll(/\{\{(.*?)\}\}/gu)].map((match) =>
        match[1]
          .split('|')
          .map((part) => part.trim())
          .join('|'),
      );
      for (const token of requiredTokens[key] ?? []) {
        if (!tokens.includes(token))
          throw new Error(`Missing Clerk token: ${locale}.${key}.${token}`);
      }
    }
  }
}
