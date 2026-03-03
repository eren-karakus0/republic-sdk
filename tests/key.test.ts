import { describe, it, expect } from 'vitest';
import { RepublicKey, hexToBytes, bytesToHex, addressToBytes, bytesToAddress } from '../src/key';

describe('RepublicKey', () => {
  // Known test vector: a fixed private key to validate deterministic output
  const TEST_PRIVATE_KEY =
    'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

  describe('constructor', () => {
    it('should generate a random key when no argument provided', () => {
      const key = RepublicKey.generate();
      expect(key.privateKey).toHaveLength(64); // 32 bytes hex
      expect(key.publicKey).toHaveLength(66); // 33 bytes hex (compressed)
    });

    it('should import a key from hex string', () => {
      const key = RepublicKey.fromPrivateKey(TEST_PRIVATE_KEY);
      expect(key.privateKey).toBe(TEST_PRIVATE_KEY);
    });

    it('should produce the same output for the same private key', () => {
      const key1 = RepublicKey.fromPrivateKey(TEST_PRIVATE_KEY);
      const key2 = RepublicKey.fromPrivateKey(TEST_PRIVATE_KEY);
      expect(key1.publicKey).toBe(key2.publicKey);
      expect(key1.getAddress()).toBe(key2.getAddress());
    });

    it('should generate different keys each time', () => {
      const key1 = RepublicKey.generate();
      const key2 = RepublicKey.generate();
      expect(key1.privateKey).not.toBe(key2.privateKey);
    });
  });

  describe('public key', () => {
    it('should produce a valid compressed public key (33 bytes)', () => {
      const key = RepublicKey.fromPrivateKey(TEST_PRIVATE_KEY);
      const compressed = key.compressedPublicKey;
      expect(compressed).toHaveLength(33);
      expect(compressed[0] === 0x02 || compressed[0] === 0x03).toBe(true);
    });

    it('should produce a valid uncompressed public key (65 bytes)', () => {
      const key = RepublicKey.fromPrivateKey(TEST_PRIVATE_KEY);
      const uncompressed = key.uncompressedPublicKey;
      expect(uncompressed).toHaveLength(65);
      expect(uncompressed[0]).toBe(0x04);
    });

    it('should return base64-encoded public key', () => {
      const key = RepublicKey.fromPrivateKey(TEST_PRIVATE_KEY);
      const b64 = key.publicKeyBase64;
      // Valid base64 string
      expect(Buffer.from(b64, 'base64').length).toBe(33);
    });
  });

  describe('address derivation', () => {
    it('should generate a valid rai1... bech32 address', () => {
      const key = RepublicKey.fromPrivateKey(TEST_PRIVATE_KEY);
      const address = key.getAddress();
      expect(address).toMatch(/^rai1[a-z0-9]+$/);
    });

    it('should generate a valid address with custom prefix', () => {
      const key = RepublicKey.fromPrivateKey(TEST_PRIVATE_KEY);
      const address = key.getAddress('raivaloper');
      expect(address).toMatch(/^raivaloper1[a-z0-9]+$/);
    });

    it('should produce 20-byte raw address', () => {
      const key = RepublicKey.fromPrivateKey(TEST_PRIVATE_KEY);
      const addrBytes = key.getAddressBytes();
      expect(addrBytes).toHaveLength(20);
    });

    it('should be deterministic (same key → same address)', () => {
      const key = RepublicKey.fromPrivateKey(TEST_PRIVATE_KEY);
      expect(key.getAddress()).toBe(key.getAddress());
    });
  });

  describe('signing and verification', () => {
    it('should sign a message and verify it', () => {
      const key = RepublicKey.fromPrivateKey(TEST_PRIVATE_KEY);
      const message = new TextEncoder().encode('hello republic');
      const signature = key.sign(message);

      expect(signature).toHaveLength(64); // compact signature: r(32) + s(32)
      expect(key.verify(message, signature)).toBe(true);
    });

    it('should fail verification with wrong message', () => {
      const key = RepublicKey.fromPrivateKey(TEST_PRIVATE_KEY);
      const message = new TextEncoder().encode('hello republic');
      const wrongMessage = new TextEncoder().encode('wrong message');
      const signature = key.sign(message);

      expect(key.verify(wrongMessage, signature)).toBe(false);
    });

    it('should fail verification with wrong key', () => {
      const key1 = RepublicKey.generate();
      const key2 = RepublicKey.generate();
      const message = new TextEncoder().encode('test message');
      const signature = key1.sign(message);

      expect(key2.verify(message, signature)).toBe(false);
    });
  });
});

describe('Utility functions', () => {
  it('hexToBytes and bytesToHex should be inverse', () => {
    const hex = 'deadbeef01020304';
    const bytes = hexToBytes(hex);
    expect(bytesToHex(bytes)).toBe(hex);
  });

  it('hexToBytes should handle 0x prefix', () => {
    const bytes = hexToBytes('0xdeadbeef');
    expect(bytesToHex(bytes)).toBe('deadbeef');
  });

  it('addressToBytes and bytesToAddress should be inverse', () => {
    const key = RepublicKey.generate();
    const address = key.getAddress();
    const bytes = addressToBytes(address);
    const rebuilt = bytesToAddress(bytes);
    expect(rebuilt).toBe(address);
  });
});
