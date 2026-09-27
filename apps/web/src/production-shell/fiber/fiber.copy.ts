import { defineMessages, useMessages } from '../../localization/messages';

const keys = ['pause', 'resume', 'reduced', 'loading', 'unavailable'] as const;

export const fiberMessages = defineMessages(keys, {
  ro: {
    pause: 'Pauză animație',
    resume: 'Reluați animația',
    reduced: 'Mișcare redusă',
    loading: 'Se încarcă animația',
    unavailable: 'Ilustrație statică',
  },
  ru: {
    pause: 'Приостановить анимацию',
    resume: 'Возобновить анимацию',
    reduced: 'Уменьшенное движение',
    loading: 'Загрузка анимации',
    unavailable: 'Статическая иллюстрация',
  },
  fr: {
    pause: 'Mettre l’animation en pause',
    resume: 'Reprendre l’animation',
    reduced: 'Mouvement réduit',
    loading: 'Chargement de l’animation',
    unavailable: 'Illustration statique',
  },
  en: {
    pause: 'Pause animation',
    resume: 'Resume animation',
    reduced: 'Reduced motion',
    loading: 'Loading animation',
    unavailable: 'Static artwork',
  },
});

export function useFiberCopy() {
  const message = useMessages(fiberMessages);
  return {
    pause: message('pause'),
    resume: message('resume'),
    reduced: message('reduced'),
    loading: message('loading'),
    unavailable: message('unavailable'),
  };
}
