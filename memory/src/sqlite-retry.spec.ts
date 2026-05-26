import { describe, it, expect, vi } from 'vitest';
import {
  withRetry,
  calculateBackoff,
  isSQLiteBusyError,
  MAX_RETRIES,
  JITTER_MIN_MS,
  JITTER_MAX_MS,
} from './sqlite-retry.js';

describe('sqlite-retry — calculateBackoff', () => {
  it('returns a value within the jitter range for attempt 0', () => {
    const delay = calculateBackoff(0);
    expect(delay).toBeGreaterThanOrEqual(JITTER_MIN_MS);
    expect(delay).toBeLessThanOrEqual(JITTER_MAX_MS);
  });

  it('returns a value within the jitter range for attempt 1 (up to 2× base)', () => {
    const delay = calculateBackoff(1);
    expect(delay).toBeGreaterThanOrEqual(JITTER_MIN_MS);
    // 2× base = 500ms max
    expect(delay).toBeLessThanOrEqual(500);
  });

  it('returns a value within the jitter range for attempt 2 (up to 4× base)', () => {
    const delay = calculateBackoff(2);
    expect(delay).toBeGreaterThanOrEqual(JITTER_MIN_MS);
    // 4× base = 1000ms max
    expect(delay).toBeLessThanOrEqual(1000);
  });

  it('never returns less than JITTER_MIN_MS', () => {
    for (let i = 0; i < 100; i++) {
      const delay = calculateBackoff(i);
      expect(delay).toBeGreaterThanOrEqual(JITTER_MIN_MS);
    }
  });

  it('produces varied values (full jitter)', () => {
    const values = new Set<number>();
    for (let i = 0; i < 50; i++) {
      values.add(calculateBackoff(0));
    }
    // With full jitter at 50 trials, very unlikely all are identical
    expect(values.size).toBeGreaterThan(1);
  });
});

describe('sqlite-retry — isSQLiteBusyError', () => {
  it('returns true for SQLITE_BUSY error message', () => {
    const err = new Error('SQLITE_BUSY: database is locked');
    expect(isSQLiteBusyError(err)).toBe(true);
  });

  it('returns true for SQLITE_BUSY with code', () => {
    const err = new Error('database is locked');
    (err as any).code = 'SQLITE_BUSY';
    expect(isSQLiteBusyError(err)).toBe(true);
  });

  it('returns false for other errors', () => {
    expect(isSQLiteBusyError(new Error('something else'))).toBe(false);
    expect(isSQLiteBusyError(new Error('SQLITE_ERROR: syntax error'))).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isSQLiteBusyError(null as any)).toBe(false);
    expect(isSQLiteBusyError(undefined as any)).toBe(false);
  });
});

describe('sqlite-retry — withRetry', () => {
  it('resolves with the operation result on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on SQLITE_BUSY and eventually succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('SQLITE_BUSY'), { code: 'SQLITE_BUSY' }))
      .mockRejectedValueOnce(Object.assign(new Error('SQLITE_BUSY'), { code: 'SQLITE_BUSY' }))
      .mockResolvedValue('recovered');

    const result = await withRetry(fn);
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws MemoryBackendBusyError after exhausting all retries', async () => {
    const busyErr = Object.assign(new Error('SQLITE_BUSY: database is locked'), { code: 'SQLITE_BUSY' });
    const fn = vi.fn().mockRejectedValue(busyErr);

    // Import at runtime to avoid circular issues
    const { MemoryBackendBusyError } = await import('./backend.js');

    await expect(withRetry(fn)).rejects.toThrow(MemoryBackendBusyError);
    expect(fn).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it('does NOT retry on non-SQLITE_BUSY errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('SQLITE_CORRUPT'));
    await expect(withRetry(fn)).rejects.toThrow('SQLITE_CORRUPT');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('re-throws MemoryBackendBusyError with attempt count and delays', async () => {
    const busyErr = Object.assign(new Error('SQLITE_BUSY'), { code: 'SQLITE_BUSY' });
    const fn = vi.fn().mockRejectedValue(busyErr);

    const { MemoryBackendBusyError } = await import('./backend.js');

    try {
      await withRetry(fn);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MemoryBackendBusyError);
      const busy = err as InstanceType<typeof MemoryBackendBusyError>;
      expect(busy.attempts).toBe(3);
      expect(busy.delays).toHaveLength(3);
      expect(busy.retryAfterMs).toBeGreaterThan(0);
    }
  });
});
