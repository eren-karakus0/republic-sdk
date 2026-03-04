import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import {
  deriveKey,
  encrypt,
  decrypt,
  encryptPrivateKey,
  decryptPrivateKey,
  isLegacyKeyStore,
  migrateLegacyStore,
  loadKeyStore,
  saveKeyStore,
} from '../src/keystore.js';
import { KeystoreError } from '../src/errors.js';
import type { LegacyKeyStore, KeyStoreV2 } from '../src/types.js';

describe('Keystore', () => {
  // ─── deriveKey ────────────────────────────────────────────────────────────

  describe('deriveKey', () => {
    it('should produce same key for same password and salt', () => {
      const salt = Buffer.from('a'.repeat(64), 'hex');
      const key1 = deriveKey('testpass', salt);
      const key2 = deriveKey('testpass', salt);
      expect(key1.toString('hex')).toBe(key2.toString('hex'));
    });

    it('should produce different keys for different passwords', () => {
      const salt = Buffer.from('b'.repeat(64), 'hex');
      const key1 = deriveKey('password1', salt);
      const key2 = deriveKey('password2', salt);
      expect(key1.toString('hex')).not.toBe(key2.toString('hex'));
    });

    it('should produce different keys for different salts', () => {
      const salt1 = Buffer.from('a'.repeat(64), 'hex');
      const salt2 = Buffer.from('b'.repeat(64), 'hex');
      const key1 = deriveKey('samepass', salt1);
      const key2 = deriveKey('samepass', salt2);
      expect(key1.toString('hex')).not.toBe(key2.toString('hex'));
    });

    it('should produce 32-byte key by default', () => {
      const salt = randomBytes(32);
      const key = deriveKey('test', salt);
      expect(key.length).toBe(32);
    });

    it('should respect custom params', () => {
      const salt = randomBytes(32);
      const key = deriveKey('test', salt, { n: 1024, r: 8, p: 1, dklen: 16 });
      expect(key.length).toBe(16);
    });
  });

  // ─── encrypt / decrypt ────────────────────────────────────────────────────

  describe('encrypt/decrypt', () => {
    it('should roundtrip correctly', () => {
      const key = randomBytes(32);
      const plaintext = Buffer.from('hello world');
      const { ciphertext, iv, tag } = encrypt(plaintext, key);
      const decrypted = decrypt(ciphertext, key, iv, tag);
      expect(decrypted.toString()).toBe('hello world');
    });

    it('should fail with wrong key', () => {
      const key1 = randomBytes(32);
      const key2 = randomBytes(32);
      const plaintext = Buffer.from('secret data');
      const { ciphertext, iv, tag } = encrypt(plaintext, key1);
      expect(() => decrypt(ciphertext, key2, iv, tag)).toThrow(KeystoreError);
    });

    it('should fail with tampered ciphertext', () => {
      const key = randomBytes(32);
      const plaintext = Buffer.from('important');
      const { ciphertext, iv, tag } = encrypt(plaintext, key);
      // Tamper with ciphertext
      ciphertext[0] ^= 0xff;
      expect(() => decrypt(ciphertext, key, iv, tag)).toThrow(KeystoreError);
    });

    it('should fail with tampered tag', () => {
      const key = randomBytes(32);
      const plaintext = Buffer.from('data');
      const { ciphertext, iv, tag } = encrypt(plaintext, key);
      tag[0] ^= 0xff;
      expect(() => decrypt(ciphertext, key, iv, tag)).toThrow(KeystoreError);
    });

    it('should produce different ciphertexts for same plaintext (random IV)', () => {
      const key = randomBytes(32);
      const plaintext = Buffer.from('same data');
      const result1 = encrypt(plaintext, key);
      const result2 = encrypt(plaintext, key);
      expect(result1.ciphertext.toString('hex')).not.toBe(result2.ciphertext.toString('hex'));
    });
  });

  // ─── encryptPrivateKey / decryptPrivateKey ────────────────────────────────

  describe('encryptPrivateKey/decryptPrivateKey', () => {
    const testPrivateKey = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

    it('should roundtrip correctly', () => {
      const crypto = encryptPrivateKey(testPrivateKey, 'mypassword');
      const decrypted = decryptPrivateKey(crypto, 'mypassword');
      expect(decrypted).toBe(testPrivateKey);
    });

    it('should fail with wrong password', () => {
      const crypto = encryptPrivateKey(testPrivateKey, 'correct');
      expect(() => decryptPrivateKey(crypto, 'wrong')).toThrow(KeystoreError);
    });

    it('should throw on empty password for encrypt', () => {
      expect(() => encryptPrivateKey(testPrivateKey, '')).toThrow(KeystoreError);
    });

    it('should throw on empty password for decrypt', () => {
      const crypto = encryptPrivateKey(testPrivateKey, 'pass');
      expect(() => decryptPrivateKey(crypto, '')).toThrow(KeystoreError);
    });

    it('should work with unicode password', () => {
      const crypto = encryptPrivateKey(testPrivateKey, '密码测试🔑');
      const decrypted = decryptPrivateKey(crypto, '密码测试🔑');
      expect(decrypted).toBe(testPrivateKey);
    });

    it('should work with long password', () => {
      const longPassword = 'a'.repeat(1000);
      const crypto = encryptPrivateKey(testPrivateKey, longPassword);
      const decrypted = decryptPrivateKey(crypto, longPassword);
      expect(decrypted).toBe(testPrivateKey);
    });

    it('should set correct crypto fields', () => {
      const crypto = encryptPrivateKey(testPrivateKey, 'pass');
      expect(crypto.cipher).toBe('aes-256-gcm');
      expect(crypto.kdf).toBe('scrypt');
      expect(crypto.kdfparams.n).toBe(16384);
      expect(crypto.kdfparams.r).toBe(8);
      expect(crypto.kdfparams.p).toBe(1);
      expect(crypto.kdfparams.dklen).toBe(32);
      expect(crypto.kdfparams.salt).toHaveLength(64); // 32 bytes hex
      expect(crypto.cipherparams.iv).toHaveLength(24); // 12 bytes hex
      expect(crypto.cipherparams.tag).toHaveLength(32); // 16 bytes hex
    });
  });

  // ─── isLegacyKeyStore ─────────────────────────────────────────────────────

  describe('isLegacyKeyStore', () => {
    it('should detect legacy format (no version field)', () => {
      const legacy = {
        mykey: { privateKey: 'abc', address: 'rai1...', publicKey: '02...' },
      };
      expect(isLegacyKeyStore(legacy)).toBe(true);
    });

    it('should reject v2 format', () => {
      const v2: KeyStoreV2 = {
        version: 2,
        keys: {},
      };
      expect(isLegacyKeyStore(v2)).toBe(false);
    });

    it('should reject null', () => {
      expect(isLegacyKeyStore(null)).toBe(false);
    });

    it('should reject non-objects', () => {
      expect(isLegacyKeyStore('string')).toBe(false);
      expect(isLegacyKeyStore(42)).toBe(false);
    });

    it('should detect empty legacy store', () => {
      expect(isLegacyKeyStore({})).toBe(true);
    });
  });

  // ─── migrateLegacyStore ───────────────────────────────────────────────────

  describe('migrateLegacyStore', () => {
    it('should migrate all keys correctly', () => {
      const legacy: LegacyKeyStore = {
        key1: { privateKey: 'aa'.repeat(32), address: 'rai1addr1', publicKey: '02pub1' },
        key2: { privateKey: 'bb'.repeat(32), address: 'rai1addr2', publicKey: '02pub2' },
      };

      const migrated = migrateLegacyStore(legacy, 'password');

      expect(migrated.version).toBe(2);
      expect(Object.keys(migrated.keys)).toHaveLength(2);

      // Check key1
      expect(migrated.keys.key1.name).toBe('key1');
      expect(migrated.keys.key1.address).toBe('rai1addr1');
      expect(migrated.keys.key1.publicKey).toBe('02pub1');
      expect(migrated.keys.key1.version).toBe(1);

      // Verify decryption works
      const decrypted1 = decryptPrivateKey(migrated.keys.key1.crypto, 'password');
      expect(decrypted1).toBe('aa'.repeat(32));

      const decrypted2 = decryptPrivateKey(migrated.keys.key2.crypto, 'password');
      expect(decrypted2).toBe('bb'.repeat(32));
    });

    it('should handle empty legacy store', () => {
      const migrated = migrateLegacyStore({}, 'password');
      expect(migrated.version).toBe(2);
      expect(Object.keys(migrated.keys)).toHaveLength(0);
    });
  });

  // ─── loadKeyStore / saveKeyStore ──────────────────────────────────────────

  describe('loadKeyStore/saveKeyStore', () => {
    const testDir = join(tmpdir(), `republic-test-${Date.now()}`);
    const testFile = join(testDir, 'keys.json');

    beforeEach(() => {
      if (!existsSync(testDir)) {
        mkdirSync(testDir, { recursive: true });
      }
    });

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should return null for non-existent file', () => {
      const result = loadKeyStore(join(testDir, 'nonexistent.json'));
      expect(result).toBeNull();
    });

    it('should save and load v2 store', () => {
      const store: KeyStoreV2 = {
        version: 2,
        keys: {
          test: {
            version: 1,
            name: 'test',
            address: 'rai1test',
            publicKey: '02test',
            crypto: encryptPrivateKey('cc'.repeat(32), 'pass'),
          },
        },
      };

      saveKeyStore(testFile, store);
      const loaded = loadKeyStore(testFile);

      expect(loaded).not.toBeNull();
      expect(isLegacyKeyStore(loaded)).toBe(false);
      const loadedV2 = loaded as KeyStoreV2;
      expect(loadedV2.version).toBe(2);
      expect(loadedV2.keys.test.address).toBe('rai1test');
    });

    it('should load legacy format', () => {
      const legacy = {
        mykey: { privateKey: 'dd'.repeat(32), address: 'rai1old', publicKey: '02old' },
      };
      writeFileSync(testFile, JSON.stringify(legacy), 'utf-8');

      const loaded = loadKeyStore(testFile);
      expect(loaded).not.toBeNull();
      expect(isLegacyKeyStore(loaded)).toBe(true);
    });
  });
});
