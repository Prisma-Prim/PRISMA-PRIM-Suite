import { expect, it } from 'vitest';
import {
  clerkAuthenticationLocalization,
  createClerkAuthenticationLocalizations,
} from './clerk-authentication-localization';
import {
  assertClerkAuthenticationCoverage,
  clerkAuthenticationMessages,
  upstreamClerkLocalizations,
  type ClerkAuthenticationMessages,
} from './clerk-authentication.copy';

it('provides explicit Romanian email guidance and validation instead of SDK English fallback', () => {
  expect(clerkAuthenticationLocalization('ro')).toMatchObject({
    formFieldInput__emailAddress_format: 'Exemplu de format: nume@exemplu.test',
    unstable__errors: {
      form_param_format_invalid__email_address:
        'Introduceți o adresă de email validă.',
    },
  });
});

it('covers every configured authentication key in all four locales', () => {
  expect(() => assertClerkAuthenticationCoverage()).not.toThrow();
  expect(clerkAuthenticationLocalization('ro').locale).toBe('ro-RO');
  expect(clerkAuthenticationLocalization('ru').locale).toBe('ru-RU');
  expect(clerkAuthenticationLocalization('fr').locale).toBe('fr-FR');
  expect(clerkAuthenticationLocalization('en').locale).toBe('en-US');
  expect(clerkAuthenticationLocalization('fr').signIn?.start?.title).toBe(
    'Se connecter à {{applicationName}}',
  );
});

it.each(['fr', 'en'] as const)(
  'resolves missing %s copy through Romanian before Clerk while still failing release coverage',
  (locale) => {
    const catalog: ClerkAuthenticationMessages = {
      ...clerkAuthenticationMessages,
      translations: {
        ...clerkAuthenticationMessages.translations,
        [locale]: {
          ...clerkAuthenticationMessages.translations[locale],
          formFieldInput__emailAddress_format: undefined,
        },
      },
    };
    const resources = createClerkAuthenticationLocalizations(catalog);
    expect(resources[locale].formFieldInput__emailAddress_format).toBe(
      'Exemplu de format: nume@exemplu.test',
    );
    expect(() => assertClerkAuthenticationCoverage(catalog)).toThrow(
      `clerkAuthentication.${locale}.formFieldInput__emailAddress_format`,
    );
  },
);

it('refuses a resource whose required Romanian fallback is missing', () => {
  const catalog: ClerkAuthenticationMessages = {
    ...clerkAuthenticationMessages,
    translations: {
      ...clerkAuthenticationMessages.translations,
      ro: {
        ...clerkAuthenticationMessages.translations.ro,
        formFieldInput__emailAddress_format: undefined,
      },
    },
  };
  expect(() => createClerkAuthenticationLocalizations(catalog)).toThrow(
    'Missing Romanian fallback',
  );
});

it('preserves provider markup and tokens without mutating upstream resources', () => {
  const originalTitle = upstreamClerkLocalizations.fr.signIn?.start?.title;
  const title = '<bold>{{applicationName}}</bold>';
  const catalog: ClerkAuthenticationMessages = {
    ...clerkAuthenticationMessages,
    translations: {
      ...clerkAuthenticationMessages.translations,
      fr: {
        ...clerkAuthenticationMessages.translations.fr,
        'signIn.start.title': title,
      },
    },
  };
  expect(
    createClerkAuthenticationLocalizations(catalog).fr.signIn?.start?.title,
  ).toBe(title);
  expect(upstreamClerkLocalizations.fr.signIn?.start?.title).toBe(
    originalTitle,
  );
});

it('rejects omitted interpolation tokens and empty required translations', () => {
  const translated = clerkAuthenticationMessages.translations.fr;
  const catalog: ClerkAuthenticationMessages = {
    ...clerkAuthenticationMessages,
    translations: {
      ...clerkAuthenticationMessages.translations,
      fr: { ...translated, 'signIn.start.title': 'Se connecter' },
    },
  };
  expect(() => assertClerkAuthenticationCoverage(catalog)).toThrow(
    'Missing Clerk token: fr.signIn.start.title.applicationName',
  );
  expect(() =>
    assertClerkAuthenticationCoverage({
      ...catalog,
      translations: {
        ...catalog.translations,
        fr: { ...translated, formButtonPrimary: '' },
      },
    }),
  ).toThrow('Empty translation: clerkAuthentication.fr.formButtonPrimary');
});

it('provides both configured email-code leaves in all four public resources', () => {
  for (const choice of [
    {
      locale: 'ro',
      edit: 'Modificați adresa de email',
      incorrect: 'Codul introdus nu este corect. Încercați din nou.',
    },
    {
      locale: 'ru',
      edit: 'Изменить адрес электронной почты',
      incorrect: 'Введён неверный код. Повторите попытку.',
    },
    {
      locale: 'fr',
      edit: 'Modifier l’adresse e-mail',
      incorrect: 'Le code saisi est incorrect. Réessayez.',
    },
    {
      locale: 'en',
      edit: 'Edit email address',
      incorrect: 'The entered code is incorrect. Please try again.',
    },
  ] as const) {
    const resource = clerkAuthenticationLocalization(choice.locale);
    expect(resource.identityPreviewEditButton__emailAddress).toBe(choice.edit);
    expect(resource.unstable__errors?.form_code_incorrect).toBe(
      choice.incorrect,
    );
    expect(clerkAuthenticationMessages.keys).toContain(
      'identityPreviewEditButton__emailAddress',
    );
    expect(clerkAuthenticationMessages.keys).toContain(
      'unstable__errors.form_code_incorrect',
    );
  }
});

it.each([
  'identityPreviewEditButton__emailAddress',
  'unstable__errors.form_code_incorrect',
] as const)(
  'guards every locale and resolves configured code omissions through Romanian: %s',
  (key) => {
    for (const locale of ['ro', 'ru', 'fr', 'en'] as const) {
      const catalog: ClerkAuthenticationMessages = {
        ...clerkAuthenticationMessages,
        translations: {
          ...clerkAuthenticationMessages.translations,
          [locale]: {
            ...clerkAuthenticationMessages.translations[locale],
            [key]: undefined,
          },
        },
      };
      expect(() => assertClerkAuthenticationCoverage(catalog)).toThrow(
        'clerkAuthentication.' + locale + '.' + key,
      );
      if (locale === 'ro')
        expect(() => createClerkAuthenticationLocalizations(catalog)).toThrow(
          'Missing Romanian fallback',
        );
      else {
        const resource =
          createClerkAuthenticationLocalizations(catalog)[locale];
        if (key === 'identityPreviewEditButton__emailAddress')
          expect(resource.identityPreviewEditButton__emailAddress).toBe(
            clerkAuthenticationMessages.translations.ro[key],
          );
        else
          expect(resource.unstable__errors?.form_code_incorrect).toBe(
            clerkAuthenticationMessages.translations.ro[key],
          );
      }
    }
  },
);
