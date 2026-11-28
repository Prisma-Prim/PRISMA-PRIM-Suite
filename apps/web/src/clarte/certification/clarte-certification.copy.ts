import { defineMessages, useMessages } from '../../localization/messages';

const keys = [
  'casesHeading',
  'casesCount',
  'caseOpened',
  'stepsNavigation',
  'registersGroup',
  'stepDone',
  'stepCurrent',
  'stepUpcoming',
  'stepNotReached',
  'stepPosition',
  'stepWaiting',
  'projectNamed',
] as const;

export type ClarteCertificationMessageKey = (typeof keys)[number];

/**
 * The Clarté Certification Case page's own texts (#1538). Step names, field
 * labels, states and commands keep the Certification catalogues, which both
 * interfaces share.
 */
export const clarteCertificationMessages = defineMessages(keys, {
  ro: {
    casesHeading: 'Dosarele de certificare ale Proiectului',
    casesCount: 'Dosare: {count}',
    caseOpened: 'Deschis la {date} de {name}',
    stepsNavigation: 'Etapele dosarului de certificare',
    registersGroup: 'Registrele dosarului',
    stepDone: 'Realizată',
    stepCurrent: 'Etapa curentă',
    stepUpcoming: 'Urmează',
    stepNotReached: 'Neatinsă',
    stepPosition: 'Etapa {position} din {total}',
    stepWaiting:
      'Această etapă se deschide după înregistrarea etapelor anterioare.',
    projectNamed: 'Proiect: {title}',
  },
  ru: {
    casesHeading: 'Дела по сертификации Проекта',
    casesCount: 'Дел: {count}',
    caseOpened: 'Открыто {date}, {name}',
    stepsNavigation: 'Этапы дела по сертификации',
    registersGroup: 'Реестры дела',
    stepDone: 'Выполнен',
    stepCurrent: 'Текущий этап',
    stepUpcoming: 'Предстоит',
    stepNotReached: 'Не достигнут',
    stepPosition: 'Этап {position} из {total}',
    stepWaiting: 'Этот этап откроется после записи предыдущих этапов.',
    projectNamed: 'Проект: {title}',
  },
  fr: {
    casesHeading: 'Dossiers de certification du Projet',
    casesCount: 'Dossiers : {count}',
    caseOpened: 'Ouvert le {date} par {name}',
    stepsNavigation: 'Étapes du dossier de certification',
    registersGroup: 'Registres du dossier',
    stepDone: 'Faite',
    stepCurrent: 'Étape en cours',
    stepUpcoming: 'À venir',
    stepNotReached: 'Non atteinte',
    stepPosition: 'Étape {position} sur {total}',
    stepWaiting:
      'Cette étape s’ouvre une fois les étapes précédentes enregistrées.',
    projectNamed: 'Projet : {title}',
  },
  en: {
    casesHeading: 'Certification Cases of this Project',
    casesCount: 'Cases: {count}',
    caseOpened: 'Opened on {date} by {name}',
    stepsNavigation: 'Steps of the Certification Case',
    registersGroup: 'Case registers',
    stepDone: 'Done',
    stepCurrent: 'Current step',
    stepUpcoming: 'Upcoming',
    stepNotReached: 'Not reached',
    stepPosition: 'Step {position} of {total}',
    stepWaiting: 'This step opens once the earlier steps are recorded.',
    projectNamed: 'Project: {title}',
  },
});

export function useClarteCertificationCopy() {
  return useMessages(clarteCertificationMessages);
}
