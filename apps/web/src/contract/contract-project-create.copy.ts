import { defineMessages, useMessages } from '../localization/messages';
const keys = [
  'title',
  'projectTitle',
  'acknowledge',
  'confirm',
  'running',
  'uncertain',
  'retry',
  'changed',
  'limit',
  'capacity',
  'invalid',
  'denied',
  'unavailable',
  'stale',
  'conflict',
  'success',
] as const;
export const contractProjectCreateMessages = defineMessages(keys, {
  en: {
    capacity: 'This Contract already has 50 linked Projects.',
    title: 'Create a preparatory Project',
    projectTitle: 'New Project title',
    acknowledge:
      'I reviewed all current candidates and want to create a new Project.',
    confirm: 'Create and link Project',
    running: 'Creating Project…',
    uncertain:
      'The creation outcome is uncertain. Retry sends the same title, candidates, revision and key.',
    retry: 'Retry the same Project creation',
    changed:
      'The candidates changed. Review the refreshed list and confirm again.',
    limit:
      'More than 50 eligible Projects exist. Link an existing Project instead.',
    invalid:
      'Enter a title of 1–200 characters and acknowledge the current candidates.',
    denied: 'Project creation access is unavailable.',
    unavailable: 'The Client or Contract is unavailable.',
    stale: 'The Contract changed. Reload before creating.',
    conflict:
      'The request conflicts with an earlier command. Reload before creating.',
    success: 'Preparatory Project created and linked.',
  },
  fr: {
    capacity: 'Ce Contrat a déjà 50 Projets liés.',
    title: 'Créer un Projet en préparation',
    projectTitle: 'Titre du nouveau Projet',
    acknowledge:
      'J’ai examiné tous les choix actuels et je souhaite créer un nouveau Projet.',
    confirm: 'Créer et lier le Projet',
    running: 'Création du Projet…',
    uncertain:
      'Le résultat est incertain. La reprise envoie le même titre, les mêmes choix, la même révision et la même clé.',
    retry: 'Réessayer la même création de Projet',
    changed:
      'Les choix ont changé. Examinez la liste actualisée et confirmez à nouveau.',
    limit: 'Plus de 50 Projets admissibles existent. Liez un Projet existant.',
    invalid:
      'Saisissez un titre de 1 à 200 caractères et confirmez les choix actuels.',
    denied: 'L’accès à la création de Projet est indisponible.',
    unavailable: 'Le Client ou le Contrat est indisponible.',
    stale: 'Le Contrat a changé. Rechargez avant de créer.',
    conflict:
      'La demande entre en conflit avec une commande antérieure. Rechargez avant de créer.',
    success: 'Projet en préparation créé et lié.',
  },
  ro: {
    capacity: 'Acest Contract are deja 50 de Proiecte asociate.',
    title: 'Creați un Proiect în pregătire',
    projectTitle: 'Titlul noului Proiect',
    acknowledge:
      'Am examinat toate opțiunile actuale și doresc să creez un Proiect nou.',
    confirm: 'Creați și asociați Proiectul',
    running: 'Se creează Proiectul…',
    uncertain:
      'Rezultatul este incert. Reîncercarea trimite același titlu, aceleași opțiuni, revizie și cheie.',
    retry: 'Reîncercați aceeași creare de Proiect',
    changed:
      'Opțiunile s-au schimbat. Examinați lista actualizată și confirmați din nou.',
    limit:
      'Există peste 50 de Proiecte eligibile. Asociați un Proiect existent.',
    invalid:
      'Introduceți un titlu de 1–200 caractere și confirmați opțiunile actuale.',
    denied: 'Accesul pentru crearea Proiectului nu este disponibil.',
    unavailable: 'Clientul sau Contractul nu este disponibil.',
    stale: 'Contractul s-a schimbat. Reîncărcați înainte de creare.',
    conflict:
      'Cererea intră în conflict cu o comandă anterioară. Reîncărcați înainte de creare.',
    success: 'Proiect în pregătire creat și asociat.',
  },
  ru: {
    capacity: 'С этим Договором уже связаны 50 Проектов.',
    title: 'Создать подготовительный Проект',
    projectTitle: 'Название нового Проекта',
    acknowledge:
      'Я просмотрел все текущие варианты и хочу создать новый Проект.',
    confirm: 'Создать и связать Проект',
    running: 'Создание Проекта…',
    uncertain:
      'Результат неизвестен. Повтор отправляет то же название, варианты, версию и ключ.',
    retry: 'Повторить то же создание Проекта',
    changed:
      'Варианты изменились. Просмотрите обновлённый список и подтвердите снова.',
    limit: 'Есть более 50 подходящих Проектов. Свяжите существующий Проект.',
    invalid:
      'Введите название из 1–200 символов и подтвердите текущие варианты.',
    denied: 'Доступ к созданию Проекта отсутствует.',
    unavailable: 'Клиент или Договор недоступен.',
    stale: 'Договор изменился. Обновите данные перед созданием.',
    conflict:
      'Запрос конфликтует с предыдущей командой. Обновите данные перед созданием.',
    success: 'Подготовительный Проект создан и связан.',
  },
});
export function useContractProjectCreateCopy() {
  return useMessages(contractProjectCreateMessages);
}
