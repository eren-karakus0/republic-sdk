import { bech32 } from 'bech32';

/**
 * Validate a bech32 address with expected prefix.
 * Throws ValidationError-style message if invalid.
 */
export function validateBech32Address(address: string, expectedPrefix: string): void {
  if (!address || typeof address !== 'string') {
    throw new Error(`Invalid address: expected a non-empty string`);
  }

  try {
    const decoded = bech32.decode(address);
    if (decoded.prefix !== expectedPrefix) {
      throw new Error(
        `Invalid address prefix: expected "${expectedPrefix}", got "${decoded.prefix}"`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Invalid address prefix')) {
      throw err;
    }
    throw new Error(`Invalid bech32 address: ${address}`);
  }
}

/**
 * Check if a string is a valid bech32 address with the given prefix.
 */
export function isValidBech32Address(address: string, expectedPrefix: string): boolean {
  try {
    validateBech32Address(address, expectedPrefix);
    return true;
  } catch {
    return false;
  }
}

// Private/reserved IP ranges (RFC 1918, RFC 5737, RFC 6598, loopback, link-local)
const PRIVATE_IP_PATTERNS = [
  /^127\./,                    // Loopback
  /^10\./,                     // Class A private
  /^172\.(1[6-9]|2\d|3[01])\./, // Class B private
  /^192\.168\./,               // Class C private
  /^169\.254\./,               // Link-local
  /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./, // Carrier-grade NAT
  /^0\./,                      // "This" network
  /^198\.51\.100\./,           // TEST-NET-2
  /^203\.0\.113\./,            // TEST-NET-3
  /^192\.0\.2\./,              // TEST-NET-1
];

const PRIVATE_HOSTNAMES = new Set([
  'localhost',
  '0.0.0.0',
  '::1',
  '::',
]);

/**
 * Check if a URL points to a private/internal network address.
 * Used to prevent SSRF attacks.
 */
export function isPrivateUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();

    if (PRIVATE_HOSTNAMES.has(hostname)) {
      return true;
    }

    // Check IPv6 loopback wrapped in brackets
    if (hostname === '[::1]' || hostname === '[::]') {
      return true;
    }

    // Check private IPv4 ranges
    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(hostname)) {
        return true;
      }
    }

    return false;
  } catch {
    // Invalid URL
    return true;
  }
}

/**
 * Validate that a URL is safe for external requests (not SSRF).
 * Throws if the URL points to a private network.
 */
export function validateExternalUrl(urlString: string): void {
  if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
    throw new Error('URL must start with http:// or https://');
  }

  if (isPrivateUrl(urlString)) {
    throw new Error('URL points to a private/internal network address');
  }
}
