import { defineMessages, useMessages } from '../localization/messages';

const messages = defineMessages(['family', 'warning', 'draft'] as const, {
  en: {
    family: 'Project working source',
    warning: 'Local original preserved for working analysis in draft form.',
    draft: 'Working draft',
  },
  ro: {
    family: 'Sursă de lucru a proiectului',
    warning:
      'Original local păstrat pentru analiza de lucru, în formă de ciornă.',
    draft: 'Ciornă de lucru',
  },
  ru: {
    family: 'Рабочий источник проекта',
    warning: 'Локальный оригинал сохранён для рабочего анализа как черновик.',
    draft: 'Рабочий черновик',
  },
  fr: {
    family: 'Source de travail du projet',
    warning:
      'Original local conservé pour l’analyse de travail, sous forme de brouillon.',
    draft: 'Brouillon de travail',
  },
});
export function useProjectSourceCopy() {
  return useMessages(messages);
}
