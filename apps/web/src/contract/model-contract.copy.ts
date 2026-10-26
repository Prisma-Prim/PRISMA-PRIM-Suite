import { defineMessages, useMessages } from '../localization/messages';
const keys = [
  'modelSource',
  'economicSource',
  'currency',
  'scope',
  'commercial',
  'title',
  'notice',
  'pendingAcceptance',
  'chooseOffer',
  'chooseModel',
  'noModel',
  'documentDate',
  'clientDetails',
  'concordance',
  'basis',
  'prepare',
  'successor',
  'copy',
  'reviewBasis',
  'rejectReason',
  'newPermissions',
  'sourceUnavailable',
  'download',
  'sourceData',
  'created',
  'decided',
  'checked',
  'refreshFailed',
  'ISSUER_MATCHES_SOURCE',
  'SERVICE_MATCHES_SOURCE',
  'FINANCIALS_MATCH_SOURCE',
  'CONDITIONS_MATCH_SOURCE',
  'SOURCE_OFFER_READY',
  'MODEL_APPROVAL_PRESERVED',
  'MODEL_WORDING_REVIEWED',
  'ANNEX_SCOPE_REVIEWED',
] as const;
export const modelContractMessages = defineMessages(keys, {
  en: {
    modelSource: 'Copied approved Contract model',
    economicSource: 'Copied approved economic source',
    currency: 'Currency',
    scope: 'Copied Offer scope',
    commercial: 'Copied commercial conditions',
    title: 'Corresponding Contract and annex',
    notice:
      'Non-official rehearsal. Internal approval confirms readiness only. It does not confirm Offer acceptance, signing, payment, authority or legal validity.',
    pendingAcceptance:
      'Offer acceptance is separate. This Contract remains unexecuted.',
    chooseOffer: 'Select the exact source Offer Version',
    chooseModel: 'Select the approved Contract model Version',
    noModel: 'No approved Contract model is currently selectable.',
    documentDate: 'Declared document date',
    clientDetails: 'Case Client requisites and representative wording',
    concordance:
      'I reviewed this Contract and its thirteen intended activities/results against the selected Offer. This declaration does not verify legal equivalence.',
    basis: 'Source concordance basis',
    prepare: 'Prepare full non-official Contract',
    successor: 'Prepare a complete successor',
    copy: 'Copy this Version into a successor draft',
    reviewBasis: 'Exact Contract and annex review basis',
    rejectReason: 'Internal rejection reason',
    newPermissions:
      'This operation requires an explicit current Contract preparation or approval capture v2 and its independent read prerequisites.',
    sourceUnavailable:
      'No current approved, transmitted and unexpired full Offer is available.',
    download: 'Download exact non-official Contract HTML',
    sourceData: 'Copied sources and financial facts',
    created: 'Contract Version preserved.',
    decided: 'Internal Contract decision recorded.',
    checked: 'Contract checks recorded.',
    refreshFailed:
      'The read failed. A previously confirmed command remains recorded.',
    ISSUER_MATCHES_SOURCE: 'Declared issuer matches the Offer model',
    SERVICE_MATCHES_SOURCE: 'Service and ordered framework editions match',
    FINANCIALS_MATCH_SOURCE: 'Exact financial values match the Offer',
    CONDITIONS_MATCH_SOURCE: 'Copied scope and commercial conditions match',
    SOURCE_OFFER_READY: 'Exact source Offer remains eligible',
    MODEL_APPROVAL_PRESERVED: 'Copied model approval remains coherent',
    MODEL_WORDING_REVIEWED: 'Human review of all Contract wording is required',
    ANNEX_SCOPE_REVIEWED:
      'Human comparison of thirteen Contract activities with eighteen Offer stages is required',
  },
  fr: {
    modelSource: 'Modèle de contrat approuvé et copié',
    economicSource: 'Source économique approuvée et copiée',
    currency: 'Devise',
    scope: 'Périmètre copié de l’offre',
    commercial: 'Conditions commerciales copiées',
    title: 'Contrat correspondant et annexe',
    notice:
      'Répétition non officielle. L’approbation interne confirme uniquement la préparation. Elle ne confirme ni acceptation de l’offre, ni signature, paiement, mandat ou validité juridique.',
    pendingAcceptance:
      'L’acceptation de l’offre est distincte. Ce contrat reste non exécuté.',
    chooseOffer: 'Sélectionner la version exacte de l’offre source',
    chooseModel: 'Sélectionner la version approuvée du modèle de contrat',
    noModel: 'Aucun modèle de contrat approuvé ne peut être sélectionné.',
    documentDate: 'Date déclarée du document',
    clientDetails: 'Coordonnées et représentation du client pour ce dossier',
    concordance:
      'J’ai examiné ce contrat et ses treize activités et résultats prévus par rapport à l’offre sélectionnée. Cette déclaration ne vérifie pas leur équivalence juridique.',
    basis: 'Justification de la concordance avec la source',
    prepare: 'Préparer le contrat non officiel complet',
    successor: 'Préparer une nouvelle version complète',
    copy: 'Copier cette version dans un brouillon de révision',
    reviewBasis: 'Justification de l’examen du contrat et de son annexe',
    rejectReason: 'Motif du refus interne',
    newPermissions:
      'Cette opération nécessite une attribution actuelle et explicite de préparation ou d’approbation de contrat v2 et les droits de lecture indépendants requis.',
    sourceUnavailable:
      'Aucune offre complète, actuelle, approuvée, transmise et encore valide n’est disponible.',
    download: 'Télécharger le HTML exact du contrat non officiel',
    sourceData: 'Sources et données financières copiées',
    created: 'Version du contrat conservée.',
    decided: 'Décision interne sur le contrat enregistrée.',
    checked: 'Contrôles du contrat enregistrés.',
    refreshFailed:
      'La lecture a échoué. Une commande déjà confirmée reste enregistrée.',
    ISSUER_MATCHES_SOURCE: 'L’émetteur déclaré correspond au modèle de l’offre',
    SERVICE_MATCHES_SOURCE:
      'Le service et les éditions ordonnées des référentiels correspondent',
    FINANCIALS_MATCH_SOURCE:
      'Les valeurs financières exactes correspondent à l’offre',
    CONDITIONS_MATCH_SOURCE:
      'Le périmètre et les conditions copiés correspondent',
    SOURCE_OFFER_READY: 'La version exacte de l’offre source reste admissible',
    MODEL_APPROVAL_PRESERVED: 'L’approbation copiée du modèle reste cohérente',
    MODEL_WORDING_REVIEWED:
      'Un examen humain de tout le contrat est nécessaire',
    ANNEX_SCOPE_REVIEWED:
      'Un examen humain des treize activités du contrat par rapport aux dix-huit étapes de l’offre est nécessaire',
  },
  ro: {
    modelSource: 'Modelul de Contract aprobat și copiat',
    economicSource: 'Sursa economică aprobată și copiată',
    currency: 'Monedă',
    scope: 'Domeniul copiat din Ofertă',
    commercial: 'Condițiile comerciale copiate',
    title: 'Contractul corespunzător și anexa',
    notice:
      'Repetiție neoficială. Aprobarea internă confirmă doar pregătirea. Nu confirmă acceptarea Ofertei, semnarea, plata, mandatul sau validitatea juridică.',
    pendingAcceptance:
      'Acceptarea Ofertei este separată. Contractul rămâne neexecutat.',
    chooseOffer: 'Selectați versiunea exactă a Ofertei sursă',
    chooseModel: 'Selectați versiunea aprobată a modelului de Contract',
    noModel:
      'Niciun model de Contract aprobat nu poate fi selectat în prezent.',
    documentDate: 'Data declarată a documentului',
    clientDetails:
      'Rechizitele și formularea reprezentării Clientului pentru acest dosar',
    concordance:
      'Am examinat Contractul și cele treisprezece activități și rezultate intenționate față de Oferta selectată. Declarația nu verifică echivalența juridică.',
    basis: 'Baza concordanței cu sursa',
    prepare: 'Pregătește Contractul neoficial complet',
    successor: 'Pregătește o versiune următoare completă',
    copy: 'Copiază această versiune într-o ciornă următoare',
    reviewBasis: 'Baza examinării Contractului exact și a anexei',
    rejectReason: 'Motivul respingerii interne',
    newPermissions:
      'Operațiunea necesită atribuirea actuală explicită de pregătire sau aprobare Contract v2 și drepturile independente de citire.',
    sourceUnavailable:
      'Nu este disponibilă o Ofertă completă actuală, aprobată, transmisă și neexpirată.',
    download: 'Descarcă HTML-ul exact al Contractului neoficial',
    sourceData: 'Sursele și datele financiare copiate',
    created: 'Versiunea Contractului a fost păstrată.',
    decided: 'Decizia internă asupra Contractului a fost înregistrată.',
    checked: 'Verificările Contractului au fost înregistrate.',
    refreshFailed:
      'Citirea a eșuat. O comandă confirmată anterior rămâne înregistrată.',
    ISSUER_MATCHES_SOURCE: 'Emitentul declarat corespunde modelului Ofertei',
    SERVICE_MATCHES_SOURCE:
      'Serviciul și edițiile ordonate ale cadrelor corespund',
    FINANCIALS_MATCH_SOURCE: 'Valorile financiare exacte corespund Ofertei',
    CONDITIONS_MATCH_SOURCE: 'Domeniul și condițiile copiate corespund',
    SOURCE_OFFER_READY: 'Versiunea exactă a Ofertei sursă rămâne eligibilă',
    MODEL_APPROVAL_PRESERVED: 'Aprobarea copiată a modelului rămâne coerentă',
    MODEL_WORDING_REVIEWED:
      'Este necesară examinarea umană a întregului text al Contractului',
    ANNEX_SCOPE_REVIEWED:
      'Este necesară compararea umană a celor treisprezece activități cu cele optsprezece etape ale Ofertei',
  },
  ru: {
    modelSource: 'Скопированная утвержденная модель договора',
    economicSource: 'Скопированный утвержденный экономический источник',
    currency: 'Валюта',
    scope: 'Скопированный объем предложения',
    commercial: 'Скопированные коммерческие условия',
    title: 'Соответствующий договор и приложение',
    notice:
      'Неофициальная репетиция. Внутреннее утверждение подтверждает только готовность. Оно не подтверждает принятие предложения, подписание, оплату, полномочия или юридическую силу.',
    pendingAcceptance:
      'Принятие предложения оформляется отдельно. Договор остается неисполненным.',
    chooseOffer: 'Выберите точную версию исходного предложения',
    chooseModel: 'Выберите утвержденную версию модели договора',
    noModel: 'Утвержденная модель договора сейчас недоступна для выбора.',
    documentDate: 'Заявленная дата документа',
    clientDetails:
      'Реквизиты и формулировка представительства клиента для этого дела',
    concordance:
      'Я рассмотрел договор и его тринадцать планируемых работ и результатов относительно выбранного предложения. Заявление не подтверждает юридическую эквивалентность.',
    basis: 'Обоснование соответствия источнику',
    prepare: 'Подготовить полный неофициальный договор',
    successor: 'Подготовить полную следующую версию',
    copy: 'Скопировать эту версию в следующий черновик',
    reviewBasis: 'Обоснование рассмотрения точного договора и приложения',
    rejectReason: 'Причина внутреннего отклонения',
    newPermissions:
      'Операция требует явного действующего назначения подготовки или утверждения договора v2 и независимых прав чтения.',
    sourceUnavailable:
      'Текущее утвержденное, переданное и неистекшее полное предложение недоступно.',
    download: 'Скачать точный HTML неофициального договора',
    sourceData: 'Скопированные источники и финансовые данные',
    created: 'Версия договора сохранена.',
    decided: 'Внутреннее решение по договору записано.',
    checked: 'Проверки договора записаны.',
    refreshFailed:
      'Чтение не удалось. Ранее подтвержденная команда остается записанной.',
    ISSUER_MATCHES_SOURCE:
      'Заявленный поставщик соответствует модели предложения',
    SERVICE_MATCHES_SOURCE:
      'Услуга и упорядоченные редакции стандартов совпадают',
    FINANCIALS_MATCH_SOURCE:
      'Точные финансовые значения соответствуют предложению',
    CONDITIONS_MATCH_SOURCE: 'Скопированные объем и условия совпадают',
    SOURCE_OFFER_READY:
      'Точная версия исходного предложения остается допустимой',
    MODEL_APPROVAL_PRESERVED:
      'Скопированное утверждение модели остается согласованным',
    MODEL_WORDING_REVIEWED:
      'Требуется проверка всего текста договора человеком',
    ANNEX_SCOPE_REVIEWED:
      'Требуется сравнение тринадцати работ договора с восемнадцатью этапами предложения человеком',
  },
});
export const useModelContractCopy = () => useMessages(modelContractMessages);
