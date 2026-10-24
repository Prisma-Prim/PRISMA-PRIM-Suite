import type { ProjectPilotPlanVersion } from './project-template.definition.js';

export const PILOT_TEMPLATE_KEY = 'CONSULTING_MISSION_PILOT_ILLUSTRATIVE';

/** Project/Task §28's immutable anonymous planning content; expected results are not execution evidence. */
export const CONSULTING_MISSION_PILOT_V1 = {
  templateKey: 'CONSULTING_MISSION_PILOT_ILLUSTRATIVE',
  version: 1,
  title: 'Plan pilot pentru o misiune de consultanță SMI',
  illustrative: true,
  activities: [
    {
      key: 'CT_AN01',
      title: 'Analiza organizației și audit diagnosticare',
      activity:
        'Analiza sistemului existent și determinarea gradului de conformare la standardele ISO',
      intendedResult: 'Plan de implementare (PDCA)',
    },
    {
      key: 'CT_AN02',
      title: 'Formarea structurii proiectului',
      activity: 'Stabilirea echipelor de lucru și a responsabililor',
      intendedResult: 'Ordine interne, structură proiect',
    },
    {
      key: 'CT_AN03',
      title: 'Elaborarea hărții proceselor',
      activity: 'Identificarea proceselor și stabilirea proprietarilor',
      intendedResult: 'Harta proceselor aprobată',
    },
    {
      key: 'CT_AN04',
      title: 'Stabilirea modelului de proces',
      activity: 'Definirea modelului de documentare și evaluare a riscurilor',
      intendedResult: 'Model proces și metodologie aprobată',
    },
    {
      key: 'CT_AN05',
      title: 'Formarea echipelor pe procese',
      activity: 'Stabilirea responsabilităților și modului de lucru',
      intendedResult: 'Structură echipe și responsabilități',
    },
    {
      key: 'CT_AN06',
      title: 'Instruirea personalului',
      activity: 'Instruirea în cerințele standardelor și documentare',
      intendedResult: 'Personal instruit și testat',
    },
    {
      key: 'CT_AN07',
      title: 'Elaborarea documentației SMI',
      activity: 'Elaborarea procedurilor, regulamentelor și instrucțiunilor',
      intendedResult: 'Documentație SMI completă',
    },
    {
      key: 'CT_AN08',
      title: 'Aprobarea documentației',
      activity: 'Analiza și aprobarea documentelor de către management',
      intendedResult: 'Documente aprobate',
    },
    {
      key: 'CT_AN09',
      title: 'Implementarea sistemului',
      activity: 'Aplicarea documentației în activitatea curentă',
      intendedResult: 'Sistem implementat',
    },
    {
      key: 'CT_AN10',
      title: 'Instruirea auditorilor interni',
      activity: 'Instruire și testare auditori',
      intendedResult: 'Auditori certificați',
    },
    {
      key: 'CT_AN11',
      title: 'Audit intern',
      activity: 'Planificare, realizare și raportare audit',
      intendedResult: 'Raport audit + NC',
    },
    {
      key: 'CT_AN12',
      title: 'Acțiuni corective',
      activity: 'Eliminarea neconformităților',
      intendedResult: 'Plan acțiuni implementat',
    },
    {
      key: 'CT_AN13',
      title: 'Suport certificare',
      activity: 'Asistență la audit extern',
      intendedResult: 'Certificare obținută',
    },
  ],
} as const satisfies ProjectPilotPlanVersion;
