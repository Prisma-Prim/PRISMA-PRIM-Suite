export const contractRecordedLocales = [
  {
    locale: 'ro',
    start: '29 feb. 2028',
    end: '1 mar. 2028',
    amount: '9.007.199.254.740.993,01',
    trailingZero: '1.234,50',
    ordinal: '1.000',
  },
  {
    locale: 'ru',
    start: '29 февр. 2028 г.',
    end: '1 мар. 2028 г.',
    amount: '9\u00a0007\u00a0199\u00a0254\u00a0740\u00a0993,01',
    trailingZero: '1\u00a0234,50',
    ordinal: '1\u00a0000',
  },
  {
    locale: 'fr',
    start: '29 févr. 2028',
    end: '1 mars 2028',
    amount: '9\u202f007\u202f199\u202f254\u202f740\u202f993,01',
    trailingZero: '1\u202f234,50',
    ordinal: '1\u202f000',
  },
  {
    locale: 'en',
    start: 'Feb 29, 2028',
    end: 'Mar 1, 2028',
    amount: '9,007,199,254,740,993.01',
    trailingZero: '1,234.50',
    ordinal: '1,000',
  },
] as const;
