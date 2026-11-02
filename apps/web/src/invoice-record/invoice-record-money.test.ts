import { expect, it } from 'vitest';
import {
  decimalToMinor,
  minorToDecimal,
  displayMoney,
} from './invoice-record-money';

it('conserves exact decimal minor units at the 14-digit boundary and distinguishes unknown from zero', () => {
  expect(decimalToMinor('999999999999.99')).toBe('99999999999999');
  expect(decimalToMinor('1255.50')).toBe('125550');
  expect(decimalToMinor('0.00')).toBe('0');
  expect(minorToDecimal('1')).toBe('0.01');
  expect(minorToDecimal('125500')).toBe('1255.00');
  expect(displayMoney({ minor: '125550', currency: 'MDL', locale: 'fr' })).toBe(
    '1\u202f255,50 MDL',
  );
  for (const invalid of [
    '1.001',
    '1e2',
    '-1',
    '+1',
    ' 1',
    '01',
    '1000000000000.00',
    '1,20',
    '',
  ])
    expect(decimalToMinor(invalid)).toBeUndefined();
});
