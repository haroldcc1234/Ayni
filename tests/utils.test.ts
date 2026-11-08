import { describe, expect, it } from 'vitest';
import {
  cn,
  firstName,
  formatPhone,
  initials,
  isValidPhone,
  uid,
  addDaysIso,
  addMinutesIso,
} from '../src/lib/utils';

describe('utils lib', () => {
  it('generates non-empty unique uids', () => {
    const id1 = uid();
    const id2 = uid();
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });

  it('extracts initials correctly', () => {
    expect(initials('Carlos Ricce')).toBe('CR');
    expect(initials('María Elena Rojas')).toBe('ME');
    expect(initials('Ana')).toBe('A');
  });

  it('extracts first name correctly', () => {
    expect(firstName('Carlos Ricce')).toBe('Carlos');
    expect(firstName('María Elena Rojas')).toBe('María');
  });

  it('validates phone numbers', () => {
    expect(isValidPhone('987654321')).toBe(true);
    expect(isValidPhone('+51 987 654 321')).toBe(true);
    expect(isValidPhone('123')).toBe(false);
    expect(isValidPhone('abc')).toBe(false);
  });

  it('formats phone numbers stripping unwanted characters', () => {
    expect(formatPhone('+51 987-654-321')).toBe('+51987654321');
  });

  it('handles date offsets correctly', () => {
    const now = Date.now();
    const plus7Days = new Date(addDaysIso(7)).getTime();
    const diffDays = Math.round((plus7Days - now) / 86400000);
    expect(diffDays).toBe(7);

    const plus30Mins = new Date(addMinutesIso(30)).getTime();
    const diffMins = Math.round((plus30Mins - now) / 60000);
    expect(diffMins).toBe(30);
  });

  it('merges css class names with cn()', () => {
    expect(cn('btn', false && 'hidden', 'btn-primary')).toBe('btn btn-primary');
  });
});
