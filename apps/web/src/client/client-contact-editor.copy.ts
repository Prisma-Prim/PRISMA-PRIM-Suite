import { useInterfaceLocale } from '../localization/interface-locale';
import {
  defineMessages,
  formatMessage,
  useMessages,
} from '../localization/messages';
import type {
  ClientContactDecisionRole,
  ClientContactValidationIssue,
} from './ClientContactEditor';

const keys = [
  'contactsEditLabel',
  'contactEditorLabel',
  'contactNameLabel',
  'contactTelephoneLabel',
  'contactEmailLabel',
  'contactPositionLabel',
  'contactPositionTooLong',
  'contactDecisionRolesLabel',
  'final_decision_maker',
  'influencer',
  'user',
  'financial',
  'technical',
  'blocker',
  'contactCommunicationPreferencesLabel',
  'contactDecisionRolesSummary',
  'contactCommunicationPreferencesSummary',
  'contactCommunicationPreferencesHelp',
  'contactCommunicationPreferencesTooLong',
  'addContact',
  'removeContact',
  'contactsInvalid',
] as const;

export const clientContactEditorMessages = defineMessages(keys, {
  ro: {
    contactDecisionRolesSummary: 'Roluri în luarea deciziilor: {roles}',
    contactCommunicationPreferencesSummary:
      'Preferințe de comunicare: {preferences}',
    contactsEditLabel: 'Contacte editabile',
    contactEditorLabel: 'Contact {position}',
    contactNameLabel: 'Numele Contactului',
    contactTelephoneLabel: 'Telefonul Contactului',
    contactEmailLabel: 'Emailul Contactului',
    contactPositionLabel: 'Funcția Contactului',
    contactPositionTooLong:
      'Funcția trebuie să aibă cel mult 500 de caractere.',
    contactDecisionRolesLabel: 'Roluri în luarea deciziilor',
    final_decision_maker: 'Decident final',
    influencer: 'Persoană de influență',
    user: 'Utilizator',
    financial: 'Financiar',
    technical: 'Tehnic',
    blocker: 'Opozant',
    contactCommunicationPreferencesLabel:
      'Preferințele de comunicare ale Contactului',
    contactCommunicationPreferencesHelp:
      'Doar preferințe practice, precum limba, canalul preferat sau orele potrivite. Salvarea nu trimite mesaje și nu înregistrează consimțământ sau aprobare.',
    contactCommunicationPreferencesTooLong:
      'Preferințele de comunicare trebuie să aibă cel mult 1000 de caractere.',
    addContact: 'Adaugă Contact',
    removeContact: 'Elimină Contact',
    contactsInvalid: 'Fiecare Contact trebuie să aibă un nume.',
  },
  ru: {
    contactDecisionRolesSummary: 'Роли в принятии решений: {roles}',
    contactCommunicationPreferencesSummary:
      'Предпочтения по общению: {preferences}',
    contactsEditLabel: 'Редактируемые Контакты',
    contactEditorLabel: 'Контакт {position}',
    contactNameLabel: 'Имя Контакта',
    contactTelephoneLabel: 'Телефон Контакта',
    contactEmailLabel: 'Email Контакта',
    contactPositionLabel: 'Должность Контакта',
    contactPositionTooLong: 'Должность должна содержать не более 500 символов.',
    contactDecisionRolesLabel: 'Роли в принятии решений',
    final_decision_maker: 'Окончательный ЛПР',
    influencer: 'Влиятельное лицо',
    user: 'Пользователь',
    financial: 'Финансовая роль',
    technical: 'Техническая роль',
    blocker: 'Противник',
    contactCommunicationPreferencesLabel: 'Предпочтения Контакта по общению',
    contactCommunicationPreferencesHelp:
      'Только практические предпочтения: язык, предпочтительный канал или удобное время. Сохранение не отправляет сообщений и не фиксирует согласие или одобрение.',
    contactCommunicationPreferencesTooLong:
      'Предпочтения по общению должны содержать не более 1000 символов.',
    addContact: 'Добавить Контакт',
    removeContact: 'Удалить Контакт',
    contactsInvalid: 'У каждого Контакта должно быть имя.',
  },
  fr: {
    contactDecisionRolesSummary: 'Rôles dans la décision : {roles}',
    contactCommunicationPreferencesSummary:
      'Préférences de communication : {preferences}',
    contactsEditLabel: 'Contacts modifiables',
    contactEditorLabel: 'Contact {position}',
    contactNameLabel: 'Nom du Contact',
    contactTelephoneLabel: 'Téléphone du Contact',
    contactEmailLabel: 'Email du Contact',
    contactPositionLabel: 'Fonction du Contact',
    contactPositionTooLong:
      'La fonction doit contenir au maximum 500 caractères.',
    contactDecisionRolesLabel: 'Rôles dans la décision',
    final_decision_maker: 'Décideur final',
    influencer: 'Personne influente',
    user: 'Utilisateur',
    financial: 'Financier',
    technical: 'Technique',
    blocker: 'Opposant',
    contactCommunicationPreferencesLabel:
      'Préférences de communication du Contact',
    contactCommunicationPreferencesHelp:
      'Préférences pratiques uniquement : langue, canal préféré ou horaires adaptés. Leur enregistrement n’envoie aucun message et ne consigne ni consentement ni approbation.',
    contactCommunicationPreferencesTooLong:
      'Les préférences de communication doivent contenir au maximum 1000 caractères.',
    addContact: 'Ajouter un Contact',
    removeContact: 'Retirer le Contact',
    contactsInvalid: 'Chaque Contact doit avoir un nom.',
  },
  en: {
    contactDecisionRolesSummary: 'Decision roles: {roles}',
    contactCommunicationPreferencesSummary:
      'Communication preferences: {preferences}',
    contactsEditLabel: 'Editable Contacts',
    contactEditorLabel: 'Contact {position}',
    contactNameLabel: 'Contact name',
    contactTelephoneLabel: 'Contact telephone',
    contactEmailLabel: 'Contact email',
    contactPositionLabel: 'Contact position',
    contactPositionTooLong: 'Position must be 500 characters or fewer.',
    contactDecisionRolesLabel: 'Decision roles',
    final_decision_maker: 'Final decision-maker',
    influencer: 'Influencer',
    user: 'User',
    financial: 'Financial',
    technical: 'Technical',
    blocker: 'Blocker',
    contactCommunicationPreferencesLabel: 'Contact communication preferences',
    contactCommunicationPreferencesHelp:
      'Practical preferences only, such as language, preferred channel or suitable times. Saving them sends no message and records no consent or approval.',
    contactCommunicationPreferencesTooLong:
      'Communication preferences must be 1000 characters or fewer.',
    addContact: 'Add Contact',
    removeContact: 'Remove Contact',
    contactsInvalid: 'Each Contact must have a name.',
  },
});

export function useClientContactEditorCopy() {
  const message = useMessages(clientContactEditorMessages);
  const { formatNumber } = useInterfaceLocale();
  return {
    contactsEditLabel: message('contactsEditLabel'),
    contactEditorLabel: (position: number) =>
      formatMessage(message('contactEditorLabel'), {
        position: formatNumber(position),
      }),
    contactNameLabel: message('contactNameLabel'),
    contactTelephoneLabel: message('contactTelephoneLabel'),
    contactEmailLabel: message('contactEmailLabel'),
    contactPositionLabel: message('contactPositionLabel'),
    contactPositionTooLong: message('contactPositionTooLong'),
    contactDecisionRolesLabel: message('contactDecisionRolesLabel'),
    contactDecisionRolesSummary: (labels: readonly string[]) =>
      formatMessage(message('contactDecisionRolesSummary'), {
        roles: labels.join(', '),
      }),
    contactCommunicationPreferencesSummary: (preferences: string) =>
      formatMessage(message('contactCommunicationPreferencesSummary'), {
        preferences,
      }),
    contactDecisionRoleLabels: {
      final_decision_maker: message('final_decision_maker'),
      influencer: message('influencer'),
      user: message('user'),
      financial: message('financial'),
      technical: message('technical'),
      blocker: message('blocker'),
    } satisfies Record<ClientContactDecisionRole, string>,
    contactCommunicationPreferencesLabel: message(
      'contactCommunicationPreferencesLabel',
    ),
    contactCommunicationPreferencesHelp: message(
      'contactCommunicationPreferencesHelp',
    ),
    contactCommunicationPreferencesTooLong: message(
      'contactCommunicationPreferencesTooLong',
    ),
    addContact: message('addContact'),
    removeContact: message('removeContact'),
    validation: (issue: ClientContactValidationIssue) => message(issue),
  };
}
