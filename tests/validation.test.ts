import { describe, it, expect } from 'vitest';
import {
  validateBech32Address,
  isValidBech32Address,
  isPrivateUrl,
  validateExternalUrl,
} from '../src/validation';

describe('validateBech32Address', () => {
  it('should accept valid rai address', () => {
    expect(() =>
      validateBech32Address('rai12rfm0s7qu0v8mwmx54uepea3kx8d2m6vk6xc0x', 'rai'),
    ).not.toThrow();
  });

  it('should accept valid raivaloper address', () => {
    expect(() =>
      validateBech32Address('raivaloper12rfm0s7qu0v8mwmx54uepea3kx8d2m6v30x9ys', 'raivaloper'),
    ).not.toThrow();
  });

  it('should reject wrong prefix', () => {
    expect(() =>
      validateBech32Address('cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu', 'rai'),
    ).toThrow('Invalid address prefix');
  });

  it('should reject invalid bech32', () => {
    expect(() => validateBech32Address('not-a-valid-address', 'rai')).toThrow(
      'Invalid bech32 address',
    );
  });

  it('should reject empty string', () => {
    expect(() => validateBech32Address('', 'rai')).toThrow('Invalid address');
  });

  it('should reject non-string input', () => {
    expect(() => validateBech32Address(null as unknown as string, 'rai')).toThrow(
      'Invalid address',
    );
  });
});

describe('isValidBech32Address', () => {
  it('should return true for valid address', () => {
    expect(
      isValidBech32Address('rai12rfm0s7qu0v8mwmx54uepea3kx8d2m6vk6xc0x', 'rai'),
    ).toBe(true);
  });

  it('should return false for invalid address', () => {
    expect(isValidBech32Address('invalid', 'rai')).toBe(false);
  });

  it('should return false for wrong prefix', () => {
    expect(
      isValidBech32Address('cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu', 'rai'),
    ).toBe(false);
  });
});

describe('isPrivateUrl', () => {
  it('should detect localhost', () => {
    expect(isPrivateUrl('http://localhost:3000')).toBe(true);
  });

  it('should detect 127.0.0.1', () => {
    expect(isPrivateUrl('http://127.0.0.1:8080')).toBe(true);
  });

  it('should detect 10.x.x.x', () => {
    expect(isPrivateUrl('http://10.0.0.1')).toBe(true);
  });

  it('should detect 172.16.x.x', () => {
    expect(isPrivateUrl('http://172.16.0.1')).toBe(true);
  });

  it('should detect 192.168.x.x', () => {
    expect(isPrivateUrl('http://192.168.1.1')).toBe(true);
  });

  it('should detect 169.254.x.x (link-local)', () => {
    expect(isPrivateUrl('http://169.254.0.1')).toBe(true);
  });

  it('should detect 0.0.0.0', () => {
    expect(isPrivateUrl('http://0.0.0.0')).toBe(true);
  });

  it('should allow public IPs', () => {
    expect(isPrivateUrl('https://8.8.8.8')).toBe(false);
  });

  it('should allow public domains', () => {
    expect(isPrivateUrl('https://panoptes.republicai.io')).toBe(false);
  });

  it('should return true for invalid URLs', () => {
    expect(isPrivateUrl('not-a-url')).toBe(true);
  });
});

describe('validateExternalUrl', () => {
  it('should accept valid https URL', () => {
    expect(() => validateExternalUrl('https://panoptes.republicai.io')).not.toThrow();
  });

  it('should accept valid http URL', () => {
    expect(() => validateExternalUrl('http://api.example.com')).not.toThrow();
  });

  it('should reject non-http scheme', () => {
    expect(() => validateExternalUrl('ftp://files.example.com')).toThrow(
      'URL must start with http:// or https://',
    );
  });

  it('should reject private URLs', () => {
    expect(() => validateExternalUrl('http://localhost:3000')).toThrow(
      'private/internal network',
    );
  });

  it('should reject 127.0.0.1', () => {
    expect(() => validateExternalUrl('http://127.0.0.1')).toThrow(
      'private/internal network',
    );
  });
});
