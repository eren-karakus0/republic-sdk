import * as secp256k1 from '@noble/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { sha256 } from '@noble/hashes/sha256';
import { hmac } from '@noble/hashes/hmac';
import { bech32 } from 'bech32';
import { randomBytes } from 'crypto';

// Required setup for @noble/secp256k1 v2
secp256k1.etc.hmacSha256Sync = (k, ...m) => {
  return hmac(sha256, k, secp256k1.etc.concatBytes(...m));
};

// secp256k1 curve order
const CURVE_ORDER = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;

export class RepublicKey {
  private readonly privKey: Uint8Array;

  constructor(privateKey?: string | Uint8Array) {
    if (privateKey) {
      const bytes =
        typeof privateKey === 'string'
          ? hexToBytes(privateKey)
          : privateKey;

      if (bytes.length !== 32) {
        throw new Error(`Invalid private key length: expected 32 bytes, got ${bytes.length}`);
      }

      // Validate key is within secp256k1 curve range (0 < key < curve order)
      const keyBigInt = bytesToBigInt(bytes);
      if (keyBigInt === 0n || keyBigInt >= CURVE_ORDER) {
        throw new Error('Private key is out of secp256k1 curve range');
      }

      this.privKey = bytes;
    } else {
      this.privKey = randomBytes(32);
    }
  }

  get privateKey(): string {
    return bytesToHex(this.privKey);
  }

  get privateKeyBytes(): Uint8Array {
    return this.privKey;
  }

  /** Uncompressed public key (65 bytes: 0x04 + X + Y) */
  get uncompressedPublicKey(): Uint8Array {
    return secp256k1.ProjectivePoint.fromPrivateKey(this.privKey)
      .toRawBytes(false);
  }

  /** Compressed public key (33 bytes: 0x02/0x03 + X) */
  get compressedPublicKey(): Uint8Array {
    return secp256k1.ProjectivePoint.fromPrivateKey(this.privKey)
      .toRawBytes(true);
  }

  /** Compressed public key as hex string */
  get publicKey(): string {
    return bytesToHex(this.compressedPublicKey);
  }

  /**
   * Derive bech32 address using ethsecp256k1 method:
   * Keccak256(uncompressed_pubkey[1:]) -> last 20 bytes -> bech32
   */
  getAddress(prefix = 'rai'): string {
    const uncompressed = this.uncompressedPublicKey;
    // Remove 0x04 prefix, hash with Keccak256
    const hash = keccak_256(uncompressed.slice(1));
    // Take last 20 bytes
    const addressBytes = hash.slice(-20);
    // Convert to bech32
    const words = bech32.toWords(addressBytes);
    return bech32.encode(prefix, words);
  }

  /** Raw 20-byte address */
  getAddressBytes(): Uint8Array {
    const uncompressed = this.uncompressedPublicKey;
    const hash = keccak_256(uncompressed.slice(1));
    return hash.slice(-20);
  }

  /**
   * Sign a message (SHA256 hash first, then secp256k1 sign).
   * Returns 64-byte compact signature (r + s).
   */
  sign(message: Uint8Array): Uint8Array {
    const hash = sha256(message);
    const sig = secp256k1.sign(hash, this.privKey);
    return sig.toCompactRawBytes();
  }

  /**
   * Verify a signature against a message.
   */
  verify(message: Uint8Array, signature: Uint8Array): boolean {
    const hash = sha256(message);
    return secp256k1.verify(signature, hash, this.compressedPublicKey);
  }

  /** Base64-encoded compressed public key (for transactions) */
  get publicKeyBase64(): string {
    return Buffer.from(this.compressedPublicKey).toString('base64');
  }

  /** Create key from hex private key string */
  static fromPrivateKey(hex: string): RepublicKey {
    return new RepublicKey(hex);
  }

  /** Generate a new random key */
  static generate(): RepublicKey {
    return new RepublicKey();
  }
}

// Utility functions

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;

  if (clean.length % 2 !== 0) {
    throw new Error('Hex string must have even length');
  }
  if (!/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error('Invalid hex character in string');
  }

  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function addressToBytes(bech32Address: string): Uint8Array {
  const decoded = bech32.decode(bech32Address);
  return new Uint8Array(bech32.fromWords(decoded.words));
}

export function bytesToAddress(bytes: Uint8Array, prefix = 'rai'): string {
  const words = bech32.toWords(bytes);
  return bech32.encode(prefix, words);
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}
