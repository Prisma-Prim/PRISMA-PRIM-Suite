import {
  defineMessages,
  formatMessage,
  useMessages,
} from '../localization/messages';

const keys = [
  'eyebrow',
  'title',
  'companyPrefix',
  'noticeLabel',
  'illustrativeMarker',
  'illustrativeDetail',
  'abilityDisclaimer',
  'definitionsTitle',
  'definitionsDescription',
  'code',
  'codeHelp',
  'name',
  'description',
  'defineService',
  'definitionCreated',
  'definitionUnchanged',
  'definitionValidation',
  'codeConflict',
  'definitionsLoading',
  'definitionsEmpty',
  'definitionsList',
  'showOlderDefinitions',
  'olderDefinitionsLoading',
  'olderDefinitionsError',
  'definitionsError',
  'retryDefinitions',
  'offeringsTitle',
  'offeringsDescription',
  'offeredDefinition',
  'selectDefinition',
  'noDefinitionsToOffer',
  'commercialLabel',
  'commercialLabelHelp',
  'offerService',
  'offeringCreated',
  'offeringUnchanged',
  'offeringValidation',
  'offeringDuplicate',
  'definitionUnavailable',
  'offeringsLoading',
  'offeringsEmpty',
  'offeringsList',
  'showOlderOfferings',
  'olderOfferingsLoading',
  'olderOfferingsError',
  'offeringsError',
  'retryOfferings',
  'availabilityAvailable',
  'provenanceIllustrative',
  'denied',
  'error',
] as const;

const english = {
  eyebrow: 'Commercial',
  title: 'Service Catalogue',
  companyPrefix: 'Company:',
  noticeLabel: 'Illustrative catalogue notice',
  illustrativeMarker: 'Illustrative catalogue: provisional records',
  illustrativeDetail:
    'Every Service Definition and offering here carries illustrative provenance. Nothing in this catalogue is a real price, tariff or commitment.',
  abilityDisclaimer:
    'This illustrative offering is non-operational: it is not evidence that the Company may perform, certify, sell or contract the service. A real offering requires a separately reviewed governed transition.',
  definitionsTitle: 'Shared Service Definitions',
  definitionsDescription:
    'Defined once for the whole Workspace. Defining a service grants nothing to any Company.',
  code: 'Service code',
  codeHelp: 'Use 1 to 40 characters: A-Z, 0-9, _ or -.',
  name: 'Service name',
  description: 'Description',
  defineService: 'Define Service',
  definitionCreated: 'Service Definition {code} recorded.',
  definitionUnchanged:
    'Service Definition {code} already existed with identical content. Nothing changed.',
  definitionValidation:
    'Enter a service code of 1 to 40 characters (A-Z, 0-9, _ or -), a name of at most 160 characters and a description of at most 2,000 characters.',
  codeConflict:
    'Service code {code} already exists in this Workspace with different content. Choose another code or reuse the existing definition unchanged.',
  definitionsLoading: 'Loading Service Definitions…',
  definitionsEmpty: 'No Service Definitions in this Workspace yet.',
  definitionsList: 'Service Definitions',
  showOlderDefinitions: 'Show older Service Definitions',
  olderDefinitionsLoading: 'Loading older Service Definitions…',
  olderDefinitionsError:
    'Older Service Definitions could not be loaded. Please try again.',
  definitionsError:
    'Service Definitions could not be loaded. Please try again.',
  retryDefinitions: 'Reload Service Definitions',
  offeringsTitle: 'Offerings of {companyName}',
  offeringsDescription:
    'Only the active Company sees its own offerings. Other Companies see the shared definition, never this list.',
  offeredDefinition: 'Service Definition',
  selectDefinition: 'Select a Service Definition',
  noDefinitionsToOffer: 'Define a Service before recording an offering.',
  commercialLabel: 'Commercial label',
  commercialLabelHelp:
    'Optional Company-specific display text of at most 160 characters. It never replaces the shared name.',
  offerService: 'Record offering',
  offeringCreated: 'Offering for {name} recorded as available.',
  offeringUnchanged:
    '{name} was already offered with the same label. Nothing changed.',
  offeringValidation:
    'Select a Service Definition and keep the commercial label at most 160 characters.',
  offeringDuplicate:
    'This Company already offers {name} with a different commercial label. Offerings cannot be changed here.',
  definitionUnavailable:
    'The selected Service Definition is no longer available. Reload the definitions and try again.',
  offeringsLoading: 'Loading offerings…',
  offeringsEmpty: 'No offerings for {companyName} yet.',
  offeringsList: 'Company Service Offerings',
  showOlderOfferings: 'Show older offerings',
  olderOfferingsLoading: 'Loading older offerings…',
  olderOfferingsError: 'Older offerings could not be loaded. Please try again.',
  offeringsError: 'Offerings could not be loaded. Please try again.',
  retryOfferings: 'Reload offerings',
  availabilityAvailable: 'Available',
  provenanceIllustrative: 'Illustrative',
  denied: 'You do not have permission to access the Service Catalogue.',
  error: 'The catalogue could not be loaded or saved. Please try again.',
};

export const serviceCatalogueMessages = defineMessages(keys, {
  ro: {
    eyebrow: 'Comercial',
    title: 'Catalogul serviciilor',
    companyPrefix: 'Companie:',
    noticeLabel: 'Notă privind catalogul ilustrativ',
    illustrativeMarker: 'Catalog ilustrativ: înregistrări provizorii',
    illustrativeDetail:
      'Fiecare definiție de serviciu și ofertă de serviciu de aici are proveniență ilustrativă. Nimic din acest catalog nu constituie un preț real, un tarif sau un angajament.',
    abilityDisclaimer:
      'Această ofertă ilustrativă de serviciu nu este operațională: nu dovedește că această Companie poate presta, certifica, vinde sau contracta serviciul. O ofertă reală de serviciu necesită o tranziție guvernată, evaluată separat.',
    definitionsTitle: 'Definiții de servicii comune',
    definitionsDescription:
      'Definite o singură dată pentru întregul Spațiu de lucru. Definirea unui serviciu nu acordă niciun drept vreunei Companii.',
    code: 'Codul serviciului',
    codeHelp: 'Folosiți între 1 și 40 de caractere: A-Z, 0-9, _ sau -.',
    name: 'Denumirea serviciului',
    description: 'Descriere',
    defineService: 'Definește serviciul',
    definitionCreated: 'Definiția serviciului {code} a fost înregistrată.',
    definitionUnchanged:
      'Definiția serviciului {code} exista deja cu un conținut identic. Nu s-a modificat nimic.',
    definitionValidation:
      'Introduceți un cod de serviciu de 1–40 de caractere (A-Z, 0-9, _ sau -), o denumire de cel mult 160 de caractere și o descriere de cel mult 2.000 de caractere.',
    codeConflict:
      'Codul serviciului {code} există deja în acest Spațiu de lucru cu un conținut diferit. Alegeți alt cod sau reutilizați definiția existentă fără modificări.',
    definitionsLoading: 'Se încarcă definițiile de servicii…',
    definitionsEmpty:
      'Nu există încă definiții de servicii în acest Spațiu de lucru.',
    definitionsList: 'Definiții de servicii',
    showOlderDefinitions: 'Arată definițiile de servicii mai vechi',
    olderDefinitionsLoading: 'Se încarcă definițiile de servicii mai vechi…',
    olderDefinitionsError:
      'Definițiile de servicii mai vechi nu au putut fi încărcate. Reîncercați.',
    definitionsError:
      'Definițiile de servicii nu au putut fi încărcate. Reîncercați.',
    retryDefinitions: 'Reîncarcă definițiile de servicii',
    offeringsTitle: 'Oferte de servicii ale {companyName}',
    offeringsDescription:
      'Numai Compania activă vede propriile oferte de servicii. Celelalte Companii văd definiția comună, niciodată această listă.',
    offeredDefinition: 'Definiția serviciului',
    selectDefinition: 'Selectați o definiție de serviciu',
    noDefinitionsToOffer:
      'Definiți un serviciu înainte de a înregistra o ofertă de serviciu.',
    commercialLabel: 'Denumire comercială',
    commercialLabelHelp:
      'Text opțional specific Companiei, de cel mult 160 de caractere. Nu înlocuiește niciodată denumirea comună.',
    offerService: 'Înregistrează oferta de serviciu',
    offeringCreated: 'Oferta pentru {name} a fost înregistrată ca disponibilă.',
    offeringUnchanged:
      '{name} era deja oferit cu aceeași denumire. Nu s-a modificat nimic.',
    offeringValidation:
      'Selectați o definiție de serviciu și limitați denumirea comercială la 160 de caractere.',
    offeringDuplicate:
      'Această Companie oferă deja {name} cu o altă denumire comercială. Ofertele de servicii nu pot fi modificate aici.',
    definitionUnavailable:
      'Definiția de serviciu selectată nu mai este disponibilă. Reîncărcați definițiile și reîncercați.',
    offeringsLoading: 'Se încarcă ofertele de servicii…',
    offeringsEmpty: 'Nu există încă oferte de servicii pentru {companyName}.',
    offeringsList: 'Oferte de servicii ale Companiei',
    showOlderOfferings: 'Arată ofertele de servicii mai vechi',
    olderOfferingsLoading: 'Se încarcă ofertele de servicii mai vechi…',
    olderOfferingsError:
      'Ofertele de servicii mai vechi nu au putut fi încărcate. Reîncercați.',
    offeringsError:
      'Ofertele de servicii nu au putut fi încărcate. Reîncercați.',
    retryOfferings: 'Reîncarcă ofertele de servicii',
    availabilityAvailable: 'Disponibil',
    provenanceIllustrative: 'Ilustrativ',
    denied: 'Nu aveți permisiunea de a accesa Catalogul serviciilor.',
    error: 'Catalogul nu a putut fi încărcat sau salvat. Reîncercați.',
  },
  ru: {
    eyebrow: 'Коммерческая работа',
    title: 'Каталог услуг',
    companyPrefix: 'Компания:',
    noticeLabel: 'Примечание об иллюстративном каталоге',
    illustrativeMarker: 'Иллюстративный каталог: предварительные записи',
    illustrativeDetail:
      'Каждое определение и предложение услуги здесь имеет иллюстративное происхождение. Ничто в этом каталоге не является реальной ценой, тарифом или обязательством.',
    abilityDisclaimer:
      'Это иллюстративное предложение услуги не предназначено для реальной работы: оно не доказывает право Компании оказывать, сертифицировать, продавать услугу или заключать договор на неё. Реальное предложение требует отдельно рассмотренного управляемого перехода.',
    definitionsTitle: 'Общие определения услуг',
    definitionsDescription:
      'Определяются один раз для всего Рабочего пространства. Определение услуги не предоставляет прав ни одной Компании.',
    code: 'Код услуги',
    codeHelp: 'Используйте от 1 до 40 символов: A-Z, 0-9, _ или -.',
    name: 'Название услуги',
    description: 'Описание',
    defineService: 'Определить услугу',
    definitionCreated: 'Определение услуги {code} зарегистрировано.',
    definitionUnchanged:
      'Определение услуги {code} уже существовало с тем же содержимым. Ничего не изменилось.',
    definitionValidation:
      'Введите код услуги длиной 1–40 символов (A-Z, 0-9, _ или -), название до 160 символов и описание до 2 000 символов.',
    codeConflict:
      'Код услуги {code} уже существует в этом Рабочем пространстве с другим содержимым. Выберите другой код или используйте существующее определение без изменений.',
    definitionsLoading: 'Загрузка определений услуг…',
    definitionsEmpty: 'В этом Рабочем пространстве пока нет определений услуг.',
    definitionsList: 'Определения услуг',
    showOlderDefinitions: 'Показать более ранние определения услуг',
    olderDefinitionsLoading: 'Загрузка более ранних определений услуг…',
    olderDefinitionsError:
      'Не удалось загрузить более ранние определения услуг. Повторите попытку.',
    definitionsError:
      'Не удалось загрузить определения услуг. Повторите попытку.',
    retryDefinitions: 'Перезагрузить определения услуг',
    offeringsTitle: 'Предложения услуг Компании {companyName}',
    offeringsDescription:
      'Только активная Компания видит собственные предложения услуг. Другие Компании видят общее определение, но никогда не видят этот список.',
    offeredDefinition: 'Определение услуги',
    selectDefinition: 'Выберите определение услуги',
    noDefinitionsToOffer:
      'Определите услугу перед регистрацией её предложения.',
    commercialLabel: 'Коммерческое название',
    commercialLabelHelp:
      'Необязательный текст Компании до 160 символов. Он никогда не заменяет общее название.',
    offerService: 'Зарегистрировать предложение услуги',
    offeringCreated: 'Предложение для {name} зарегистрировано как доступное.',
    offeringUnchanged:
      '{name} уже предлагалось с тем же названием. Ничего не изменилось.',
    offeringValidation:
      'Выберите определение услуги и ограничьте коммерческое название 160 символами.',
    offeringDuplicate:
      'Эта Компания уже предлагает {name} с другим коммерческим названием. Предложения услуг нельзя изменить здесь.',
    definitionUnavailable:
      'Выбранное определение услуги больше недоступно. Перезагрузите определения и повторите попытку.',
    offeringsLoading: 'Загрузка предложений услуг…',
    offeringsEmpty: 'У Компании {companyName} пока нет предложений услуг.',
    offeringsList: 'Предложения услуг Компании',
    showOlderOfferings: 'Показать более ранние предложения услуг',
    olderOfferingsLoading: 'Загрузка более ранних предложений услуг…',
    olderOfferingsError:
      'Не удалось загрузить более ранние предложения услуг. Повторите попытку.',
    offeringsError:
      'Не удалось загрузить предложения услуг. Повторите попытку.',
    retryOfferings: 'Перезагрузить предложения услуг',
    availabilityAvailable: 'Доступно',
    provenanceIllustrative: 'Иллюстративное',
    denied: 'У вас нет разрешения на доступ к Каталогу услуг.',
    error: 'Не удалось загрузить или сохранить каталог. Повторите попытку.',
  },
  fr: {
    eyebrow: 'Commercial',
    title: 'Catalogue des services',
    companyPrefix: 'Compagnie :',
    noticeLabel: 'Note sur le catalogue illustratif',
    illustrativeMarker: 'Catalogue illustratif : enregistrements provisoires',
    illustrativeDetail:
      'Chaque Définition de service et prestation présentée ici a une provenance illustrative. Rien dans ce catalogue ne constitue un prix réel, un tarif ou un engagement.',
    abilityDisclaimer:
      'Cette prestation illustrative n’est pas opérationnelle : elle ne prouve pas que la Compagnie peut réaliser, certifier, vendre ou contractualiser le service. Une prestation réelle nécessite une transition gouvernée, examinée séparément.',
    definitionsTitle: 'Définitions de services partagées',
    definitionsDescription:
      'Définies une seule fois pour tout l’Espace de travail. Définir un service n’accorde aucun droit à une Compagnie.',
    code: 'Code du service',
    codeHelp: 'Utilisez 1 à 40 caractères : A-Z, 0-9, _ ou -.',
    name: 'Nom du service',
    description: 'Description',
    defineService: 'Définir le service',
    definitionCreated: 'Définition de service {code} enregistrée.',
    definitionUnchanged:
      'La Définition de service {code} existait déjà avec un contenu identique. Rien n’a changé.',
    definitionValidation:
      'Saisissez un code de service de 1 à 40 caractères (A-Z, 0-9, _ ou -), un nom de 160 caractères au maximum et une description de 2 000 caractères au maximum.',
    codeConflict:
      'Le code de service {code} existe déjà dans cet Espace de travail avec un contenu différent. Choisissez un autre code ou réutilisez la définition existante sans la modifier.',
    definitionsLoading: 'Chargement des Définitions de services…',
    definitionsEmpty:
      'Aucune Définition de service dans cet Espace de travail pour le moment.',
    definitionsList: 'Définitions de services',
    showOlderDefinitions: 'Afficher les Définitions de services plus anciennes',
    olderDefinitionsLoading:
      'Chargement des Définitions de services plus anciennes…',
    olderDefinitionsError:
      'Les Définitions de services plus anciennes n’ont pas pu être chargées. Réessayez.',
    definitionsError:
      'Les Définitions de services n’ont pas pu être chargées. Réessayez.',
    retryDefinitions: 'Recharger les Définitions de services',
    offeringsTitle: 'Prestations de {companyName}',
    offeringsDescription:
      'Seule la Compagnie active voit ses propres prestations. Les autres Compagnies voient la définition partagée, jamais cette liste.',
    offeredDefinition: 'Définition de service',
    selectDefinition: 'Sélectionnez une Définition de service',
    noDefinitionsToOffer:
      'Définissez un service avant d’enregistrer une prestation.',
    commercialLabel: 'Libellé commercial',
    commercialLabelHelp:
      'Texte facultatif propre à la Compagnie, de 160 caractères au maximum. Il ne remplace jamais le nom partagé.',
    offerService: 'Enregistrer la prestation',
    offeringCreated: 'Prestation pour {name} enregistrée comme disponible.',
    offeringUnchanged:
      '{name} était déjà proposé avec le même libellé. Rien n’a changé.',
    offeringValidation:
      'Sélectionnez une Définition de service et limitez le libellé commercial à 160 caractères.',
    offeringDuplicate:
      'Cette Compagnie propose déjà {name} avec un autre libellé commercial. Les prestations ne peuvent pas être modifiées ici.',
    definitionUnavailable:
      'La Définition de service sélectionnée n’est plus disponible. Rechargez les définitions et réessayez.',
    offeringsLoading: 'Chargement des prestations…',
    offeringsEmpty: 'Aucune prestation pour {companyName} pour le moment.',
    offeringsList: 'Prestations de la Compagnie',
    showOlderOfferings: 'Afficher les prestations plus anciennes',
    olderOfferingsLoading: 'Chargement des prestations plus anciennes…',
    olderOfferingsError:
      'Les prestations plus anciennes n’ont pas pu être chargées. Réessayez.',
    offeringsError: 'Les prestations n’ont pas pu être chargées. Réessayez.',
    retryOfferings: 'Recharger les prestations',
    availabilityAvailable: 'Disponible',
    provenanceIllustrative: 'Illustratif',
    denied:
      'Vous n’avez pas l’autorisation d’accéder au Catalogue des services.',
    error: 'Le catalogue n’a pas pu être chargé ou enregistré. Réessayez.',
  },
  en: english,
});

export function useServiceCatalogueCopy() {
  const message = useMessages(serviceCatalogueMessages);
  return {
    eyebrow: message('eyebrow'),
    title: message('title'),
    companyPrefix: message('companyPrefix'),
    noticeLabel: message('noticeLabel'),
    illustrativeMarker: message('illustrativeMarker'),
    illustrativeDetail: message('illustrativeDetail'),
    abilityDisclaimer: message('abilityDisclaimer'),
    definitionsTitle: message('definitionsTitle'),
    definitionsDescription: message('definitionsDescription'),
    code: message('code'),
    codeHelp: message('codeHelp'),
    name: message('name'),
    description: message('description'),
    defineService: message('defineService'),
    definitionCreated: (code: string) =>
      formatMessage(message('definitionCreated'), { code }),
    definitionUnchanged: (code: string) =>
      formatMessage(message('definitionUnchanged'), { code }),
    definitionValidation: message('definitionValidation'),
    codeConflict: (code: string) =>
      formatMessage(message('codeConflict'), { code }),
    definitionsLoading: message('definitionsLoading'),
    definitionsEmpty: message('definitionsEmpty'),
    definitionsList: message('definitionsList'),
    showOlderDefinitions: message('showOlderDefinitions'),
    olderDefinitionsLoading: message('olderDefinitionsLoading'),
    olderDefinitionsError: message('olderDefinitionsError'),
    definitionsError: message('definitionsError'),
    retryDefinitions: message('retryDefinitions'),
    offeringsTitle: (companyName: string) =>
      formatMessage(message('offeringsTitle'), { companyName }),
    offeringsDescription: message('offeringsDescription'),
    offeredDefinition: message('offeredDefinition'),
    selectDefinition: message('selectDefinition'),
    noDefinitionsToOffer: message('noDefinitionsToOffer'),
    commercialLabel: message('commercialLabel'),
    commercialLabelHelp: message('commercialLabelHelp'),
    offerService: message('offerService'),
    offeringCreated: (name: string) =>
      formatMessage(message('offeringCreated'), { name }),
    offeringUnchanged: (name: string) =>
      formatMessage(message('offeringUnchanged'), { name }),
    offeringValidation: message('offeringValidation'),
    offeringDuplicate: (name: string) =>
      formatMessage(message('offeringDuplicate'), { name }),
    definitionUnavailable: message('definitionUnavailable'),
    offeringsLoading: message('offeringsLoading'),
    offeringsEmpty: (companyName: string) =>
      formatMessage(message('offeringsEmpty'), { companyName }),
    offeringsList: message('offeringsList'),
    showOlderOfferings: message('showOlderOfferings'),
    olderOfferingsLoading: message('olderOfferingsLoading'),
    olderOfferingsError: message('olderOfferingsError'),
    offeringsError: message('offeringsError'),
    retryOfferings: message('retryOfferings'),
    denied: message('denied'),
    error: message('error'),
    availabilityLabels: { AVAILABLE: message('availabilityAvailable') },
    provenanceLabels: { ILLUSTRATIVE: message('provenanceIllustrative') },
  };
}
