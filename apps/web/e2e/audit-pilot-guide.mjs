const copy = {
  ro: {
    title: 'Pilot fictiv de audit',
    label: 'LOCAL · DATE FICTIVE · FĂRĂ VALOARE OFICIALĂ',
    intro:
      'Deschide aplicația reală și parcurge dosarul de exemplu. Datele rămân disponibile cât timp comanda pilotului rulează.',
    actors: 'Alege participantul fictiv',
    manager: 'Manager de program',
    auditor: 'Auditor',
    approver: 'Aprobator independent',
    reader: 'Cititor',
    dossier: 'Dosarul pregătit',
    company: 'Companie',
    project: 'Proiect',
    order: 'Comandă de certificare',
    originals: 'Originale fictive pentru exercițiu',
    pdf: 'PDF bilingv: două pagini lizibile și o pagină goală',
    docx: 'DOCX bilingv: valori de lucru și o contradicție',
    steps: 'Parcurs de încercat',
    phases: [
      'În aplicație, alege compania și proiectul de mai jos. Alege Română sau Русский din selectorul limbii.',
      'În analiza dosarului, adaugă PDF-ul nativ și DOCX-ul de exemplu. Creează analiza, deschide originalele și verifică citările și pagina necitibilă.',
      'Introdu sau inspectează propuneri și confirmă ori corectează deliberat fiecare valoare. Confirmarea analizei nu modifică datele oficiale. În cerere poți previzualiza și alege câmpurile revizuite; salvarea este o acțiune separată și poate cere reverificarea pașilor ulteriori.',
      'Ca manager, propune echipa. Ca aprobator independent, verifică propunerea. Managerul înregistrează planurile etapelor 1 și 2 la pașii corespunzători. Auditorul își înregistrează rapoartele, constatările și recomandarea; decizia rămâne un act distinct.',
      'După decizia de acordare, descarcă exemplul de certificat de mai jos. Înregistrează PDF-ul prin comenzile native, apoi parcurge proiectul, opinia clientului, aprobarea, emiterea și transmiterea. Descarcă registrul dosarului din aplicație.',
    ],
    certificate:
      'Exemplu PDF de certificat — disponibil după decizia de acordare',
    note: 'Scenariul pornește de la acordul semnat, înainte de aprobarea echipei și de decizie. Folosește exemple fictive pentru fiecare act; pilotul nu califică identități, scanner, OCR sau documente reale.',
    provenance: 'Identități exacte și amprente ale originalelor',
    stop: 'Oprire: Ctrl+C în terminal. Comanda închide numai sesiunea și baza de date pe care le-a creat.',
  },
  ru: {
    title: 'Учебный пилот аудита',
    label: 'ЛОКАЛЬНО · ВЫМЫШЛЕННЫЕ ДАННЫЕ · НЕ ОФИЦИАЛЬНЫЙ ДОКУМЕНТ',
    intro:
      'Откройте настоящее приложение и пройдите пример досье. Данные доступны, пока работает команда пилота.',
    actors: 'Выберите учебного участника',
    manager: 'Менеджер программы',
    auditor: 'Аудитор',
    approver: 'Независимый утверждающий',
    reader: 'Читатель',
    dossier: 'Подготовленное досье',
    company: 'Компания',
    project: 'Проект',
    order: 'Заказ на сертификацию',
    originals: 'Вымышленные оригиналы для упражнения',
    pdf: 'Двуязычный PDF: две читаемые страницы и пустая страница',
    docx: 'Двуязычный DOCX: рабочие значения и противоречие',
    steps: 'Попробуйте пройти путь',
    phases: [
      'В приложении выберите указанную ниже компанию и проект. Выберите Română или Русский в переключателе языка.',
      'В анализе досье добавьте исходный PDF и учебный DOCX. Создайте анализ, откройте оригиналы и проверьте цитаты и нечитаемую страницу.',
      'Введите или проверьте предложения и явно подтвердите либо исправьте каждое значение. Подтверждение анализа не меняет официальные данные. В заявке можно просмотреть и выбрать проверенные поля; сохранение — отдельное действие и может потребовать повторной проверки последующих шагов.',
      'Как менеджер предложите группу. Как независимый утверждающий проверьте предложение. Менеджер записывает планы этапов 1 и 2 на соответствующих шагах. Аудитор записывает отчёты, выводы и рекомендацию; решение остаётся отдельным действием.',
      'После положительного решения скачайте учебный сертификат ниже. Зарегистрируйте PDF штатными командами и пройдите проект, мнение клиента, утверждение, выдачу и передачу. Скачайте реестр досье из приложения.',
    ],
    certificate:
      'Учебный PDF сертификата — доступен после положительного решения',
    note: 'Начальная точка примера — подписанное соглашение, до утверждения группы и решения. Используйте учебные данные для каждого действия; пилот не квалифицирует настоящие учётные записи, сканер, OCR или документы.',
    provenance: 'Точные идентификаторы и контрольные суммы оригиналов',
    stop: 'Остановка: Ctrl+C в терминале. Команда закрывает только созданную ею сессию и базу данных.',
  },
};

const escape = (value) =>
  String(value).replace(
    /[&<>"']/gu,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ],
  );

export function pilotGuide(manifest, locale) {
  const c = copy[locale];
  const rows = [
    [c.company, manifest.companyName],
    [c.project, manifest.projectTitle],
    [c.order, manifest.orderReference],
  ];
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${c.title}</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f7f8fc;color:#202438;font:16px/1.55 system-ui,sans-serif}main{max-width:1040px;margin:auto;padding:36px 20px}h1{font-size:clamp(2rem,6vw,3.2rem);line-height:1.1}h2{font-size:1.25rem}a{color:#5542bc;overflow-wrap:anywhere}nav{display:flex;gap:16px;justify-content:flex-end}section{background:white;border:1px solid #dddfea;border-radius:16px;padding:24px;margin:24px 0}.badge{font-size:.75rem;letter-spacing:.08em;color:#5947b5}.roles{display:flex;flex-wrap:wrap;gap:12px}.roles a{display:block;padding:12px 16px;border:1px solid #d5caff;border-radius:10px;text-decoration:none;background:#f4f0ff}.roles small{display:block;color:#536078}dl{display:grid;grid-template-columns:minmax(90px,1fr) 3fr;gap:8px}dt{font-weight:600}dd{margin:0;overflow-wrap:anywhere}li{margin:12px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.8rem}.notice{border-left:4px solid #7560d6;padding:12px 16px;background:#f1edff}footer{color:#536078}@media(max-width:500px){section{padding:16px}dl{display:block}dd{margin-bottom:12px}}
  </style></head><body><main><nav aria-label="Language"><a href="/__pilot?lang=ro">Română</a><a href="/__pilot?lang=ru">Русский</a></nav><p class="badge">${c.label}</p><h1>${c.title}</h1><p>${c.intro}</p><p class="notice">${c.note}</p><section><h2>${c.actors}</h2><div class="roles">${Object.entries(
    manifest.participants,
  )
    .map(
      ([role, participant]) =>
        `<a href="/__pilot/actor/${role}">${c[role]}<small>${escape(participant.displayName)}</small></a>`,
    )
    .join(
      '',
    )}</div></section><section><h2>${c.dossier}</h2><dl>${rows.map(([label, value]) => `<dt>${label}</dt><dd>${escape(value)}</dd>`).join('')}</dl></section><section><h2>${c.originals}</h2><ul><li><a href="/__pilot/sources/evidence.pdf">${c.pdf}</a></li><li><a href="/__pilot/sources/review.docx">${c.docx}</a></li></ul></section><section><h2>${c.steps}</h2><ol>${c.phases.map((phase) => `<li>${phase}</li>`).join('')}</ol><a href="/__pilot/sources/certificate-example.pdf">${c.certificate}</a></section><details><summary>${c.provenance}</summary><pre>${escape(JSON.stringify(manifest, null, 2))}</pre></details><footer><p>${c.stop}</p></footer></main></body></html>`;
}
