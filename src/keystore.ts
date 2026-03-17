import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'fs';
import { createInterface } from 'readline';
import type { EncryptedKey, KeyStoreV2, LegacyKeyStore, ScryptParams } from './types.js';
import { KeystoreError } from './errors.js';

const DEFAULT_SCRYPT_PARAMS: ScryptParams = {
  n: 16384,
  r: 8,
  p: 1,
  dklen: 32,
};

export function deriveKey(
  password: string,
  salt: Buffer,
  params: ScryptParams = DEFAULT_SCRYPT_PARAMS,
): Buffer {
  return scryptSync(password, salt, params.dklen, {
    N: params.n,
    r: params.r,
    p: params.p,
  });
}

export function encrypt(plaintext: Buffer, key: Buffer): { ciphertext: Buffer; iv: Buffer; tag: Buffer } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: encrypted, iv, tag };
}

export function decrypt(ciphertext: Buffer, key: Buffer, iv: Buffer, tag: Buffer): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new KeystoreError('Decryption failed: wrong password or corrupted data');
  }
}

export function encryptPrivateKey(
  privateKeyHex: string,
  password: string,
): EncryptedKey['crypto'] {
  if (!password) {
    throw new KeystoreError('Password cannot be empty');
  }

  const salt = randomBytes(32);
  const params = { ...DEFAULT_SCRYPT_PARAMS };
  const derivedKey = deriveKey(password, salt, params);
  const plaintext = Buffer.from(privateKeyHex, 'hex');
  const { ciphertext, iv, tag } = encrypt(plaintext, derivedKey);

  return {
    cipher: 'aes-256-gcm',
    ciphertext: ciphertext.toString('hex'),
    cipherparams: {
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
    },
    kdf: 'scrypt',
    kdfparams: {
      ...params,
      salt: salt.toString('hex'),
    },
  };
}

export function decryptPrivateKey(
  crypto: EncryptedKey['crypto'],
  password: string,
): string {
  if (!password) {
    throw new KeystoreError('Password cannot be empty');
  }

  const salt = Buffer.from(crypto.kdfparams.salt, 'hex');
  const derivedKey = deriveKey(password, salt, {
    n: crypto.kdfparams.n,
    r: crypto.kdfparams.r,
    p: crypto.kdfparams.p,
    dklen: crypto.kdfparams.dklen,
  });

  const ciphertext = Buffer.from(crypto.ciphertext, 'hex');
  const iv = Buffer.from(crypto.cipherparams.iv, 'hex');
  const tag = Buffer.from(crypto.cipherparams.tag, 'hex');

  const decrypted = decrypt(ciphertext, derivedKey, iv, tag);
  return decrypted.toString('hex');
}

export function isLegacyKeyStore(data: unknown): data is LegacyKeyStore {
  return typeof data === 'object' && data !== null && !('version' in data);
}

export function migrateLegacyStore(legacy: LegacyKeyStore, password: string): KeyStoreV2 {
  const keys: Record<string, EncryptedKey> = {};

  for (const [name, entry] of Object.entries(legacy)) {
    keys[name] = {
      version: 1,
      name,
      address: entry.address,
      publicKey: entry.publicKey,
      crypto: encryptPrivateKey(entry.privateKey, password),
    };
  }

  return { version: 2, keys };
}

export function loadKeyStore(filePath: string): KeyStoreV2 | LegacyKeyStore | null {
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, 'utf-8');
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new KeystoreError(`Keystore file is corrupted: ${filePath}`);
  }

  if (isLegacyKeyStore(data)) {
    return data;
  }

  return data as KeyStoreV2;
}

export function saveKeyStore(filePath: string, store: KeyStoreV2): void {
  writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8');
  try {
    chmodSync(filePath, 0o600);
  } catch {
    // chmod may not work on Windows
  }
}

export async function promptPassword(message = 'Enter password: '): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: true,
    });

    // Attempt to hide input on terminals that support it
    if (process.stderr.isTTY) {
      process.stderr.write(message);
      const stdin = process.stdin;
      const wasRaw = stdin.isRaw;
      if (stdin.setRawMode) {
        stdin.setRawMode(true);
      }

      let password = '';
      const onData = (chunk: Buffer) => {
        const ch = chunk.toString('utf-8');
        for (const c of ch) {
          if (c === '\n' || c === '\r') {
            process.stderr.write('\n');
            stdin.removeListener('data', onData);
            if (stdin.setRawMode) {
              stdin.setRawMode(wasRaw ?? false);
            }
            rl.close();
            resolve(password);
            return;
          } else if (c === '\u007F' || c === '\b') {
            // Backspace
            if (password.length > 0) {
              password = password.slice(0, -1);
            }
          } else if (c === '\u0003') {
            // Ctrl+C
            process.stderr.write('\n');
            rl.close();
            process.exit(1);
          } else {
            password += c;
          }
        }
      };
      stdin.on('data', onData);
    } else {
      // Non-TTY fallback (piped input)
      rl.question(message, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}
