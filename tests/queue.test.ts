import { describe, expect, it } from 'vitest';

export function calculateBackoffSeconds(attempts: number): number {
  return Math.min(10 * 2 ** (attempts - 1), 300);
}

describe('sync queue backoff logic', () => {
  it('implements exponential backoff capped at 300 seconds (5 minutes)', () => {
    // Attempt 1: 10 * 2^0 = 10s
    expect(calculateBackoffSeconds(1)).toBe(10);
    // Attempt 2: 10 * 2^1 = 20s
    expect(calculateBackoffSeconds(2)).toBe(20);
    // Attempt 3: 10 * 2^2 = 40s
    expect(calculateBackoffSeconds(3)).toBe(40);
    // Attempt 4: 10 * 2^3 = 80s
    expect(calculateBackoffSeconds(4)).toBe(80);
    // Attempt 5: 10 * 2^4 = 160s
    expect(calculateBackoffSeconds(5)).toBe(160);
    // Attempt 6: 10 * 2^5 = 320 -> capped at 300s
    expect(calculateBackoffSeconds(6)).toBe(300);
    // Attempt 10: capped at 300s
    expect(calculateBackoffSeconds(10)).toBe(300);
  });
});
