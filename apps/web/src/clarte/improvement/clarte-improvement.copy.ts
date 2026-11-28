import { defineMessages, useMessages } from '../../localization/messages';

const keys = [
  'ideasHeading',
  'ideaColumn',
  'proposeIdea',
  'decideHeading',
  'postpone',
  'reject',
  'reviewDate',
  'addNote',
  'existingMeasuresLabel',
  'sourceDescriptionLabel',
  'plannedDateLabel',
  'occurredOnLabel',
  'panelParts',
  'decisionPart',
  'factsPart',
  'historyPart',
] as const;

/**
 * The Clarté Improvement screens' own texts (#1545). Field labels, states
 * and commands keep the Ideas and Operational Risk catalogues, which both
 * interfaces share.
 */
export const clarteImprovementMessages = defineMessages(keys, {
  ro: {
    ideasHeading: 'Idei înregistrate',
    ideaColumn: 'Idee',
    proposeIdea: 'Propuneți o idee',
    decideHeading: 'Decizie asupra ideii',
    postpone: 'Amânați',
    reject: 'Respingeți',
    reviewDate: 'Data de reanalizare declarată',
    addNote: 'Adăugați o notă în jurnal',
    existingMeasuresLabel: 'Măsuri existente',
    sourceDescriptionLabel: 'Sursă descrisă',
    plannedDateLabel: 'Data planificată',
    occurredOnLabel: 'Data faptului',
    panelParts: 'Părțile panoului',
    decisionPart: 'Decizie',
    factsPart: 'Fapte',
    historyPart: 'Istoric',
  },
  ru: {
    ideasHeading: 'Зарегистрированные идеи',
    ideaColumn: 'Идея',
    proposeIdea: 'Предложить идею',
    decideHeading: 'Решение по идее',
    postpone: 'Отложить',
    reject: 'Отклонить',
    reviewDate: 'Заявленная дата пересмотра',
    addNote: 'Добавить запись в журнал',
    existingMeasuresLabel: 'Существующие меры',
    sourceDescriptionLabel: 'Описание источника',
    plannedDateLabel: 'Планируемая дата',
    occurredOnLabel: 'Дата события',
    panelParts: 'Разделы панели',
    decisionPart: 'Решение',
    factsPart: 'Факты',
    historyPart: 'История',
  },
  fr: {
    ideasHeading: 'Idées enregistrées',
    ideaColumn: 'Idée',
    proposeIdea: 'Proposer une idée',
    decideHeading: 'Décision sur l’idée',
    postpone: 'Reporter',
    reject: 'Rejeter',
    reviewDate: 'Date de réexamen déclarée',
    addNote: 'Ajouter une note au journal',
    existingMeasuresLabel: 'Mesures existantes',
    sourceDescriptionLabel: 'Source décrite',
    plannedDateLabel: 'Date prévue',
    occurredOnLabel: 'Date du fait',
    panelParts: 'Parties du panneau',
    decisionPart: 'Décision',
    factsPart: 'Faits',
    historyPart: 'Historique',
  },
  en: {
    ideasHeading: 'Recorded Ideas',
    ideaColumn: 'Idea',
    proposeIdea: 'Propose an Idea',
    decideHeading: 'Decide on the Idea',
    postpone: 'Postpone',
    reject: 'Reject',
    reviewDate: 'Declared review date',
    addNote: 'Add a log note',
    existingMeasuresLabel: 'Existing measures',
    sourceDescriptionLabel: 'Source description',
    plannedDateLabel: 'Planned date',
    occurredOnLabel: 'Occurrence date',
    panelParts: 'Parts of this panel',
    decisionPart: 'Decision',
    factsPart: 'Facts',
    historyPart: 'History',
  },
});

export function useClarteImprovementCopy() {
  return useMessages(clarteImprovementMessages);
}
