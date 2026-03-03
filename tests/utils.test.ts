import { describe, it, expect, vi } from 'vitest';
import { sleep, retry, araiToRai, raiToArai } from '../src/utils';

describe('sleep', () => {
  it('should resolve after given ms', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});

describe('retry', () => {
  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retry(fn, { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('ok');

    const result = await retry(fn, { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max retries exceeded', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(
      retry(fn, { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 100 }),
    ).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('should not retry on 4xx client errors', async () => {
    const clientError = { response: { status: 400 } };
    const fn = vi.fn().mockRejectedValue(clientError);

    await expect(
      retry(fn, { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100 }),
    ).rejects.toBe(clientError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on 5xx server errors', async () => {
    const serverError = { response: { status: 500 } };
    const fn = vi.fn()
      .mockRejectedValueOnce(serverError)
      .mockResolvedValue('ok');

    const result = await retry(fn, { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should use exponential backoff', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    const start = Date.now();
    await retry(fn, { maxRetries: 3, baseDelayMs: 50, maxDelayMs: 1000 });
    const elapsed = Date.now() - start;

    // First retry delay: 50ms (baseDelay * 2^0)
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  it('should cap delay at maxDelayMs', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    const start = Date.now();
    await retry(fn, { maxRetries: 3, baseDelayMs: 50, maxDelayMs: 60 });
    const elapsed = Date.now() - start;

    // Should not exceed ~180ms (3 * 60ms max delay)
    expect(elapsed).toBeLessThan(500);
  });
});

describe('araiToRai', () => {
  it('should convert whole numbers', () => {
    expect(araiToRai('1000000000000000000')).toBe('1');
    expect(araiToRai('2000000000000000000')).toBe('2');
  });

  it('should convert zero', () => {
    expect(araiToRai('0')).toBe('0');
  });

  it('should convert fractional amounts', () => {
    expect(araiToRai('1500000000000000000')).toBe('1.5');
    expect(araiToRai('100000000000000000')).toBe('0.1');
  });

  it('should handle small amounts', () => {
    expect(araiToRai('1')).toBe('0.000000000000000001');
  });

  it('should handle large amounts', () => {
    expect(araiToRai('123456789000000000000000000')).toBe('123456789');
  });
});

describe('raiToArai', () => {
  it('should convert whole numbers', () => {
    expect(raiToArai('1')).toBe('1000000000000000000');
    expect(raiToArai('2')).toBe('2000000000000000000');
  });

  it('should convert zero', () => {
    expect(raiToArai('0')).toBe('0');
  });

  it('should convert fractional amounts', () => {
    expect(raiToArai('1.5')).toBe('1500000000000000000');
    expect(raiToArai('0.1')).toBe('100000000000000000');
  });

  it('should be inverse of araiToRai for whole numbers', () => {
    expect(raiToArai(araiToRai('5000000000000000000'))).toBe('5000000000000000000');
  });

  it('should handle very small fractions', () => {
    expect(raiToArai('0.000000000000000001')).toBe('1');
  });

  it('should truncate beyond 18 decimals', () => {
    expect(raiToArai('1.0000000000000000001')).toBe('1000000000000000000');
  });
});
