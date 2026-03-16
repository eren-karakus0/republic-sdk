export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

export async function retry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>,
): Promise<T> {
  const opts = { ...DEFAULT_RETRY, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt === opts.maxRetries) break;

      // Don't retry client errors (4xx)
      if (isClientError(err)) throw err;

      const delay = Math.min(
        opts.baseDelayMs * Math.pow(2, attempt),
        opts.maxDelayMs,
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

function isClientError(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    // Axios error with 4xx status
    if (e.response && typeof e.response === 'object') {
      const status = (e.response as Record<string, unknown>).status;
      if (typeof status === 'number' && status >= 400 && status < 500) {
        return true;
      }
    }
  }
  return false;
}

const ARAI_DECIMALS = 18n;
const ARAI_FACTOR = 10n ** ARAI_DECIMALS;

export function araiToRai(arai: string): string {
  if (!arai || typeof arai !== 'string' || !/^\d+$/.test(arai)) {
    throw new Error(`Invalid arai amount: "${arai}"`);
  }
  const value = BigInt(arai);
  const whole = value / ARAI_FACTOR;
  const frac = value % ARAI_FACTOR;

  if (frac === 0n) return whole.toString();

  const fracStr = frac.toString().padStart(18, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}

export function raiToArai(rai: string): string {
  if (!rai || typeof rai !== 'string' || !/^\d+(\.\d+)?$/.test(rai)) {
    throw new Error(`Invalid amount: "${rai}"`);
  }
  const parts = rai.split('.');
  const whole = BigInt(parts[0]);

  if (parts.length === 1) {
    return (whole * ARAI_FACTOR).toString();
  }

  let fracStr = parts[1];
  if (fracStr.length > 18) {
    fracStr = fracStr.slice(0, 18);
  }
  fracStr = fracStr.padEnd(18, '0');

  const frac = BigInt(fracStr);
  return (whole * ARAI_FACTOR + frac).toString();
}
