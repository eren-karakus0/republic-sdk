import { Command } from 'commander';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { RepublicKey } from '../src/key.js';
import { RepublicClient } from '../src/client.js';
import { JobManager } from '../src/job.js';
import { signTx, msgSend, msgDelegate, msgWithdrawReward, msgVote } from '../src/transaction.js';
import { araiToRai } from '../src/utils.js';
import { REPUBLIC_TESTNET, DEFAULT_GAS_LIMIT, DEFAULT_FEE_AMOUNT } from '../src/constants.js';
import {
  encryptPrivateKey,
  decryptPrivateKey,
  isLegacyKeyStore,
  migrateLegacyStore,
  loadKeyStore,
  saveKeyStore,
  promptPassword,
} from '../src/keystore.js';
import type { KeyStoreV2, LegacyKeyStore, EncryptedKey } from '../src/types.js';

const CONFIG_DIR = join(homedir(), '.republic-sdk');
const KEYS_FILE = join(CONFIG_DIR, 'keys.json');

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function getPasswordFromEnv(): string | null {
  return process.env.REPUBLIC_SDK_PASSWORD ?? null;
}

async function getPassword(message = 'Enter password: ', opts?: { noPassword?: boolean }): Promise<string> {
  if (opts?.noPassword) {
    return '';
  }

  const envPassword = getPasswordFromEnv();
  if (envPassword) {
    return envPassword;
  }

  return promptPassword(message);
}

function loadKeysV2(): KeyStoreV2 {
  const data = loadKeyStore(KEYS_FILE);
  if (data === null) {
    return { version: 2, keys: {} };
  }

  if (isLegacyKeyStore(data)) {
    // Return as-is but wrapped - migration needs password so can't do it here
    // Callers should check and migrate when needed
    return { version: 2, keys: {} };
  }

  return data;
}

function hasLegacyKeys(): boolean {
  const data = loadKeyStore(KEYS_FILE);
  return data !== null && isLegacyKeyStore(data);
}

function loadLegacyKeys(): LegacyKeyStore {
  const data = loadKeyStore(KEYS_FILE);
  if (data !== null && isLegacyKeyStore(data)) {
    return data;
  }
  return {};
}

async function getDecryptedKey(name: string, opts?: { noPassword?: boolean }): Promise<RepublicKey> {
  if (opts?.noPassword) {
    // In no-password mode, check legacy store first
    const data = loadKeyStore(KEYS_FILE);
    if (data !== null && isLegacyKeyStore(data)) {
      const entry = data[name];
      if (!entry) {
        console.error(`Key "${name}" not found. Use 'keys list' to see available keys.`);
        process.exit(1);
      }
      return RepublicKey.fromPrivateKey(entry.privateKey);
    }
    console.error('--no-password requires plaintext keystore. Use "keys migrate" to migrate or remove --no-password flag.');
    process.exit(1);
  }

  const data = loadKeyStore(KEYS_FILE);

  // Legacy store: prompt for migration
  if (data !== null && isLegacyKeyStore(data)) {
    console.error('Legacy plaintext keystore detected. Run "republic-sdk keys migrate" to encrypt your keys.');
    const entry = data[name];
    if (!entry) {
      console.error(`Key "${name}" not found.`);
      process.exit(1);
    }
    return RepublicKey.fromPrivateKey(entry.privateKey);
  }

  const store = data as KeyStoreV2 | null;
  if (!store || !store.keys[name]) {
    console.error(`Key "${name}" not found. Use 'keys list' to see available keys.`);
    process.exit(1);
  }

  const password = await getPassword('Enter password to unlock key: ');
  try {
    const privateKeyHex = decryptPrivateKey(store.keys[name].crypto, password);
    return RepublicKey.fromPrivateKey(privateKeyHex);
  } catch (err) {
    console.error('Failed to decrypt key:', (err as Error).message);
    process.exit(1);
  }
}

function parsePositiveInt(value: string, label: string, min = 1): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) {
    console.error(`Invalid ${label}: "${value}". Must be an integer >= ${min}.`);
    process.exit(1);
  }
  return n;
}

const program = new Command();

program
  .name('republic-sdk')
  .description('CLI for Republic AI blockchain')
  .version('0.2.0');

// ─── Keys ─────────────────────────────────────────────────────────────────────

const keys = program.command('keys').description('Key management');

keys
  .command('create <name>')
  .description('Create a new key pair')
  .option('--no-password', 'Store key without encryption (not recommended)')
  .action(async (name: string, opts: { noPassword?: boolean }) => {
    if (opts.noPassword) {
      console.warn('WARNING: Storing key without encryption. Use only for testing/CI.');
    }

    // Check for legacy store
    if (hasLegacyKeys()) {
      const legacy = loadLegacyKeys();
      if (legacy[name]) {
        console.error(`Key "${name}" already exists.`);
        process.exit(1);
      }

      if (opts.noPassword) {
        const key = RepublicKey.generate();
        legacy[name] = {
          privateKey: key.privateKey,
          address: key.getAddress(),
          publicKey: key.publicKey,
        };
        ensureConfigDir();
        const { writeFileSync, chmodSync } = await import('fs');
        writeFileSync(KEYS_FILE, JSON.stringify(legacy, null, 2), 'utf-8');
        try { chmodSync(KEYS_FILE, 0o600); } catch { /* Windows */ }
        console.log(`Key created: ${name}`);
        console.log(`Address:     ${key.getAddress()}`);
        console.log(`Public Key:  ${key.publicKey}`);
        return;
      }
    }

    const store = loadKeysV2();
    if (store.keys[name]) {
      console.error(`Key "${name}" already exists.`);
      process.exit(1);
    }

    const key = RepublicKey.generate();
    const address = key.getAddress();

    if (opts.noPassword) {
      // Store in legacy format for no-password mode
      const legacy = loadLegacyKeys();
      legacy[name] = {
        privateKey: key.privateKey,
        address,
        publicKey: key.publicKey,
      };
      ensureConfigDir();
      const { writeFileSync, chmodSync } = await import('fs');
      writeFileSync(KEYS_FILE, JSON.stringify(legacy, null, 2), 'utf-8');
      try { chmodSync(KEYS_FILE, 0o600); } catch { /* Windows */ }
    } else {
      const password = await getPassword('Create password for key: ');
      const confirmPassword = await getPassword('Confirm password: ');
      if (password !== confirmPassword) {
        console.error('Passwords do not match.');
        process.exit(1);
      }

      const encrypted: EncryptedKey = {
        version: 1,
        name,
        address,
        publicKey: key.publicKey,
        crypto: encryptPrivateKey(key.privateKey, password),
      };

      store.keys[name] = encrypted;
      ensureConfigDir();
      saveKeyStore(KEYS_FILE, store);
    }

    console.log(`Key created: ${name}`);
    console.log(`Address:     ${address}`);
    console.log(`Public Key:  ${key.publicKey}`);
  });

keys
  .command('list')
  .description('List all stored keys')
  .action(() => {
    const data = loadKeyStore(KEYS_FILE);

    if (data === null) {
      console.log('No keys found.');
      return;
    }

    let names: string[];
    let getAddress: (name: string) => string;

    if (isLegacyKeyStore(data)) {
      names = Object.keys(data);
      getAddress = (n) => data[n].address;
    } else {
      const store = data as KeyStoreV2;
      names = Object.keys(store.keys);
      getAddress = (n) => store.keys[n].address;
    }

    if (names.length === 0) {
      console.log('No keys found.');
      return;
    }

    console.log('Name'.padEnd(20) + 'Address');
    console.log('-'.repeat(60));
    for (const name of names) {
      console.log(name.padEnd(20) + getAddress(name));
    }
  });

keys
  .command('show <name>')
  .description('Show key details')
  .action((name: string) => {
    const data = loadKeyStore(KEYS_FILE);

    if (data === null) {
      console.error(`Key "${name}" not found.`);
      process.exit(1);
    }

    if (isLegacyKeyStore(data)) {
      const entry = data[name];
      if (!entry) {
        console.error(`Key "${name}" not found.`);
        process.exit(1);
      }
      console.log(`Name:       ${name}`);
      console.log(`Address:    ${entry.address}`);
      console.log(`Public Key: ${entry.publicKey}`);
      console.log(`Encrypted:  no`);
    } else {
      const store = data as KeyStoreV2;
      const entry = store.keys[name];
      if (!entry) {
        console.error(`Key "${name}" not found.`);
        process.exit(1);
      }
      console.log(`Name:       ${name}`);
      console.log(`Address:    ${entry.address}`);
      console.log(`Public Key: ${entry.publicKey}`);
      console.log(`Encrypted:  yes`);
    }
  });

keys
  .command('import <name> <private-key>')
  .description('Import a key from hex private key')
  .option('--no-password', 'Store key without encryption (not recommended)')
  .action(async (name: string, privateKeyHex: string, opts: { noPassword?: boolean }) => {
    if (opts.noPassword) {
      console.warn('WARNING: Storing key without encryption. Use only for testing/CI.');
    }

    try {
      const key = RepublicKey.fromPrivateKey(privateKeyHex);
      const address = key.getAddress();

      if (opts.noPassword) {
        const legacy = loadLegacyKeys();
        if (legacy[name]) {
          console.error(`Key "${name}" already exists.`);
          process.exit(1);
        }
        legacy[name] = {
          privateKey: key.privateKey,
          address,
          publicKey: key.publicKey,
        };
        ensureConfigDir();
        const { writeFileSync, chmodSync } = await import('fs');
        writeFileSync(KEYS_FILE, JSON.stringify(legacy, null, 2), 'utf-8');
        try { chmodSync(KEYS_FILE, 0o600); } catch { /* Windows */ }
      } else {
        const store = loadKeysV2();
        if (store.keys[name]) {
          console.error(`Key "${name}" already exists.`);
          process.exit(1);
        }

        const password = await getPassword('Create password for key: ');
        const confirmPassword = await getPassword('Confirm password: ');
        if (password !== confirmPassword) {
          console.error('Passwords do not match.');
          process.exit(1);
        }

        const encrypted: EncryptedKey = {
          version: 1,
          name,
          address,
          publicKey: key.publicKey,
          crypto: encryptPrivateKey(key.privateKey, password),
        };

        store.keys[name] = encrypted;
        ensureConfigDir();
        saveKeyStore(KEYS_FILE, store);
      }

      console.log(`Key imported: ${name}`);
      console.log(`Address:      ${address}`);
    } catch (err) {
      console.error('Invalid private key:', (err as Error).message);
      process.exit(1);
    }
  });

keys
  .command('export <name>')
  .description('Export private key (hex)')
  .option('--no-password', 'Skip password prompt (only works with plaintext store)')
  .action(async (name: string, opts: { noPassword?: boolean }) => {
    const data = loadKeyStore(KEYS_FILE);

    if (data === null) {
      console.error(`Key "${name}" not found.`);
      process.exit(1);
    }

    if (isLegacyKeyStore(data)) {
      const entry = data[name];
      if (!entry) {
        console.error(`Key "${name}" not found.`);
        process.exit(1);
      }
      console.log(entry.privateKey);
      return;
    }

    const store = data as KeyStoreV2;
    const entry = store.keys[name];
    if (!entry) {
      console.error(`Key "${name}" not found.`);
      process.exit(1);
    }

    const password = await getPassword('Enter password to export key: ', opts);
    try {
      const privateKeyHex = decryptPrivateKey(entry.crypto, password);
      console.log(privateKeyHex);
    } catch (err) {
      console.error('Failed to decrypt key:', (err as Error).message);
      process.exit(1);
    }
  });

keys
  .command('delete <name>')
  .description('Delete a stored key')
  .action(async (name: string) => {
    const data = loadKeyStore(KEYS_FILE);

    if (data === null) {
      console.error(`Key "${name}" not found.`);
      process.exit(1);
    }

    if (isLegacyKeyStore(data)) {
      if (!data[name]) {
        console.error(`Key "${name}" not found.`);
        process.exit(1);
      }
      delete data[name];
      ensureConfigDir();
      const fs = await import('fs');
      fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2), 'utf-8');
      try { fs.chmodSync(KEYS_FILE, 0o600); } catch { /* Windows */ }
    } else {
      const store = data as KeyStoreV2;
      if (!store.keys[name]) {
        console.error(`Key "${name}" not found.`);
        process.exit(1);
      }
      delete store.keys[name];
      saveKeyStore(KEYS_FILE, store);
    }

    console.log(`Key "${name}" deleted.`);
  });

keys
  .command('migrate')
  .description('Migrate plaintext keys to encrypted keystore')
  .action(async () => {
    const data = loadKeyStore(KEYS_FILE);

    if (data === null) {
      console.log('No keystore found. Nothing to migrate.');
      return;
    }

    if (!isLegacyKeyStore(data)) {
      console.log('Keystore is already encrypted. Nothing to migrate.');
      return;
    }

    const names = Object.keys(data);
    if (names.length === 0) {
      console.log('No keys found. Nothing to migrate.');
      return;
    }

    console.log(`Found ${names.length} plaintext key(s): ${names.join(', ')}`);
    const password = await getPassword('Create encryption password: ');
    const confirmPassword = await getPassword('Confirm password: ');
    if (password !== confirmPassword) {
      console.error('Passwords do not match. Migration aborted.');
      process.exit(1);
    }

    const encrypted = migrateLegacyStore(data, password);
    ensureConfigDir();
    saveKeyStore(KEYS_FILE, encrypted);
    console.log(`Successfully migrated ${names.length} key(s) to encrypted keystore.`);
  });

// ─── Node Status ──────────────────────────────────────────────────────────────

program
  .command('node-status')
  .description('Query node status')
  .option('--rpc <endpoint>', 'RPC endpoint', REPUBLIC_TESTNET.rpc)
  .action(async (opts: { rpc: string }) => {
    try {
      const client = new RepublicClient({ rpc: opts.rpc });
      const status = await client.getStatus();
      console.log(`Network:      ${status.nodeInfo.network}`);
      console.log(`Moniker:      ${status.nodeInfo.moniker}`);
      console.log(`Version:      ${status.nodeInfo.version}`);
      console.log(`Block Height: ${status.syncInfo.latestBlockHeight}`);
      console.log(`Block Time:   ${status.syncInfo.latestBlockTime}`);
      console.log(`Catching Up:  ${status.syncInfo.catchingUp}`);
    } catch (err) {
      console.error('Failed to query node:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── Balance ──────────────────────────────────────────────────────────────────

program
  .command('balance <address>')
  .description('Query account balance')
  .option('--rpc <endpoint>', 'RPC endpoint', REPUBLIC_TESTNET.rpc)
  .option('--rest <endpoint>', 'REST endpoint', REPUBLIC_TESTNET.rest)
  .action(async (address: string, opts: { rpc: string; rest: string }) => {
    try {
      const client = new RepublicClient({ rpc: opts.rpc, rest: opts.rest });
      const balances = await client.getBalances(address);

      if (balances.length === 0) {
        console.log('No balances found.');
        return;
      }

      for (const coin of balances) {
        if (coin.denom === 'arai') {
          console.log(`${araiToRai(coin.amount)} RAI (${coin.amount} ${coin.denom})`);
        } else {
          console.log(`${coin.amount} ${coin.denom}`);
        }
      }
    } catch (err) {
      console.error('Failed to query balance:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── Send ─────────────────────────────────────────────────────────────────────

program
  .command('send')
  .description('Send tokens')
  .requiredOption('--from <key>', 'Sender key name')
  .requiredOption('--to <address>', 'Recipient address')
  .requiredOption('--amount <amount>', 'Amount in arai')
  .option('--rpc <endpoint>', 'RPC endpoint', REPUBLIC_TESTNET.rpc)
  .option('--rest <endpoint>', 'REST endpoint', REPUBLIC_TESTNET.rest)
  .option('--memo <memo>', 'Transaction memo', '')
  .option('--gas <limit>', 'Gas limit', String(DEFAULT_GAS_LIMIT))
  .option('--fees <amount>', 'Fee amount in arai', DEFAULT_FEE_AMOUNT)
  .option('--no-password', 'Skip password prompt (plaintext keys only)')
  .action(async (opts: {
    from: string; to: string; amount: string;
    rpc: string; rest: string; memo: string; gas: string; fees: string;
    noPassword?: boolean;
  }) => {
    try {
      const key = await getDecryptedKey(opts.from, { noPassword: opts.noPassword });
      const client = new RepublicClient({ rpc: opts.rpc, rest: opts.rest });
      const address = key.getAddress();
      const accountInfo = await client.getAccountInfoSafe(address);

      const msg = msgSend(address, opts.to, [
        { denom: REPUBLIC_TESTNET.denom, amount: opts.amount },
      ]);

      const txBytes = signTx(key, [msg], {
        accountNumber: accountInfo.accountNumber,
        sequence: accountInfo.sequence,
        gasLimit: parsePositiveInt(opts.gas, 'gas limit'),
        feeAmount: opts.fees,
        memo: opts.memo,
      });

      const result = await client.broadcastTx(txBytes);
      console.log(`TX Hash: ${result.hash}`);
      console.log(`Code:    ${result.code}`);
    } catch (err) {
      console.error('Failed:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── Delegate ─────────────────────────────────────────────────────────────────

program
  .command('delegate')
  .description('Delegate tokens to a validator')
  .requiredOption('--from <key>', 'Delegator key name')
  .requiredOption('--validator <address>', 'Validator address')
  .requiredOption('--amount <amount>', 'Amount in arai')
  .option('--rpc <endpoint>', 'RPC endpoint', REPUBLIC_TESTNET.rpc)
  .option('--rest <endpoint>', 'REST endpoint', REPUBLIC_TESTNET.rest)
  .option('--memo <memo>', 'Transaction memo', '')
  .option('--gas <limit>', 'Gas limit', String(DEFAULT_GAS_LIMIT))
  .option('--fees <amount>', 'Fee amount in arai', DEFAULT_FEE_AMOUNT)
  .option('--no-password', 'Skip password prompt (plaintext keys only)')
  .action(async (opts: {
    from: string; validator: string; amount: string;
    rpc: string; rest: string; memo: string; gas: string; fees: string;
    noPassword?: boolean;
  }) => {
    try {
      const key = await getDecryptedKey(opts.from, { noPassword: opts.noPassword });
      const client = new RepublicClient({ rpc: opts.rpc, rest: opts.rest });
      const address = key.getAddress();
      const accountInfo = await client.getAccountInfoSafe(address);

      const msg = msgDelegate(address, opts.validator, {
        denom: REPUBLIC_TESTNET.denom,
        amount: opts.amount,
      });

      const txBytes = signTx(key, [msg], {
        accountNumber: accountInfo.accountNumber,
        sequence: accountInfo.sequence,
        gasLimit: parsePositiveInt(opts.gas, 'gas limit'),
        feeAmount: opts.fees,
        memo: opts.memo,
      });

      const result = await client.broadcastTx(txBytes);
      console.log(`TX Hash: ${result.hash}`);
      console.log(`Code:    ${result.code}`);
    } catch (err) {
      console.error('Failed:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── Validators ───────────────────────────────────────────────────────────────

program
  .command('validators')
  .description('List validators')
  .option('--status <status>', 'Filter by status (BOND_STATUS_BONDED, BOND_STATUS_UNBONDING, BOND_STATUS_UNBONDED)')
  .option('--rpc <endpoint>', 'RPC endpoint', REPUBLIC_TESTNET.rpc)
  .option('--rest <endpoint>', 'REST endpoint', REPUBLIC_TESTNET.rest)
  .action(async (opts: { status?: string; rpc: string; rest: string }) => {
    try {
      const client = new RepublicClient({ rpc: opts.rpc, rest: opts.rest });
      const validators = await client.getValidators(
        opts.status as 'BOND_STATUS_BONDED' | 'BOND_STATUS_UNBONDING' | 'BOND_STATUS_UNBONDED' | undefined,
      );

      if (validators.length === 0) {
        console.log('No validators found.');
        return;
      }

      console.log('Moniker'.padEnd(25) + 'Operator Address'.padEnd(55) + 'Status'.padEnd(28) + 'Tokens');
      console.log('-'.repeat(130));
      for (const v of validators) {
        console.log(
          v.moniker.slice(0, 24).padEnd(25) +
          v.operatorAddress.padEnd(55) +
          v.status.padEnd(28) +
          araiToRai(v.tokens) + ' RAI',
        );
      }
    } catch (err) {
      console.error('Failed to query validators:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── Delegations ──────────────────────────────────────────────────────────────

program
  .command('delegations <address>')
  .description('List delegations for an address')
  .option('--rpc <endpoint>', 'RPC endpoint', REPUBLIC_TESTNET.rpc)
  .option('--rest <endpoint>', 'REST endpoint', REPUBLIC_TESTNET.rest)
  .action(async (address: string, opts: { rpc: string; rest: string }) => {
    try {
      const client = new RepublicClient({ rpc: opts.rpc, rest: opts.rest });
      const delegations = await client.getDelegations(address);

      if (delegations.length === 0) {
        console.log('No delegations found.');
        return;
      }

      console.log('Validator'.padEnd(55) + 'Amount');
      console.log('-'.repeat(80));
      for (const d of delegations) {
        const amount = d.balance.denom === 'arai'
          ? `${araiToRai(d.balance.amount)} RAI`
          : `${d.balance.amount} ${d.balance.denom}`;
        console.log(d.validatorAddress.padEnd(55) + amount);
      }
    } catch (err) {
      console.error('Failed to query delegations:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── Rewards ──────────────────────────────────────────────────────────────────

program
  .command('rewards <address>')
  .description('Query staking rewards for an address')
  .option('--rpc <endpoint>', 'RPC endpoint', REPUBLIC_TESTNET.rpc)
  .option('--rest <endpoint>', 'REST endpoint', REPUBLIC_TESTNET.rest)
  .action(async (address: string, opts: { rpc: string; rest: string }) => {
    try {
      const client = new RepublicClient({ rpc: opts.rpc, rest: opts.rest });
      const rewards = await client.getRewards(address);

      if (rewards.length === 0) {
        console.log('No rewards found.');
        return;
      }

      for (const r of rewards) {
        console.log(`Validator: ${r.validatorAddress}`);
        for (const coin of r.reward) {
          if (coin.denom === 'arai') {
            console.log(`  ${araiToRai(coin.amount)} RAI`);
          } else {
            console.log(`  ${coin.amount} ${coin.denom}`);
          }
        }
      }
    } catch (err) {
      console.error('Failed to query rewards:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── Withdraw Rewards ─────────────────────────────────────────────────────────

program
  .command('withdraw-rewards')
  .description('Withdraw staking rewards from a validator')
  .requiredOption('--from <key>', 'Delegator key name')
  .requiredOption('--validator <address>', 'Validator address')
  .option('--rpc <endpoint>', 'RPC endpoint', REPUBLIC_TESTNET.rpc)
  .option('--rest <endpoint>', 'REST endpoint', REPUBLIC_TESTNET.rest)
  .option('--memo <memo>', 'Transaction memo', '')
  .option('--gas <limit>', 'Gas limit', String(DEFAULT_GAS_LIMIT))
  .option('--fees <amount>', 'Fee amount in arai', DEFAULT_FEE_AMOUNT)
  .option('--no-password', 'Skip password prompt (plaintext keys only)')
  .action(async (opts: {
    from: string; validator: string;
    rpc: string; rest: string; memo: string; gas: string; fees: string;
    noPassword?: boolean;
  }) => {
    try {
      const key = await getDecryptedKey(opts.from, { noPassword: opts.noPassword });
      const client = new RepublicClient({ rpc: opts.rpc, rest: opts.rest });
      const address = key.getAddress();
      const accountInfo = await client.getAccountInfoSafe(address);

      const msg = msgWithdrawReward(address, opts.validator);

      const txBytes = signTx(key, [msg], {
        accountNumber: accountInfo.accountNumber,
        sequence: accountInfo.sequence,
        gasLimit: parsePositiveInt(opts.gas, 'gas limit'),
        feeAmount: opts.fees,
        memo: opts.memo,
      });

      const result = await client.broadcastTx(txBytes);
      console.log(`TX Hash: ${result.hash}`);
      console.log(`Code:    ${result.code}`);
    } catch (err) {
      console.error('Failed:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── Vote ─────────────────────────────────────────────────────────────────────

program
  .command('vote')
  .description('Vote on a governance proposal')
  .requiredOption('--from <key>', 'Voter key name')
  .requiredOption('--proposal <id>', 'Proposal ID')
  .requiredOption('--option <option>', 'Vote option: yes (1), abstain (2), no (3), no_with_veto (4)')
  .option('--rpc <endpoint>', 'RPC endpoint', REPUBLIC_TESTNET.rpc)
  .option('--rest <endpoint>', 'REST endpoint', REPUBLIC_TESTNET.rest)
  .option('--memo <memo>', 'Transaction memo', '')
  .option('--gas <limit>', 'Gas limit', String(DEFAULT_GAS_LIMIT))
  .option('--fees <amount>', 'Fee amount in arai', DEFAULT_FEE_AMOUNT)
  .option('--no-password', 'Skip password prompt (plaintext keys only)')
  .action(async (opts: {
    from: string; proposal: string; option: string;
    rpc: string; rest: string; memo: string; gas: string; fees: string;
    noPassword?: boolean;
  }) => {
    try {
      const proposalId = parsePositiveInt(opts.proposal, 'proposal ID');

      const voteMap: Record<string, number> = {
        yes: 1, abstain: 2, no: 3, no_with_veto: 4,
        '1': 1, '2': 2, '3': 3, '4': 4,
      };
      const voteOption = voteMap[opts.option.toLowerCase()];
      if (!voteOption) {
        console.error('Invalid vote option. Use: yes, abstain, no, no_with_veto (or 1-4)');
        process.exit(1);
      }

      const key = await getDecryptedKey(opts.from, { noPassword: opts.noPassword });
      const client = new RepublicClient({ rpc: opts.rpc, rest: opts.rest });
      const address = key.getAddress();
      const accountInfo = await client.getAccountInfoSafe(address);

      const msg = msgVote(String(proposalId), address, voteOption);

      const txBytes = signTx(key, [msg], {
        accountNumber: accountInfo.accountNumber,
        sequence: accountInfo.sequence,
        gasLimit: parsePositiveInt(opts.gas, 'gas limit'),
        feeAmount: opts.fees,
        memo: opts.memo,
      });

      const result = await client.broadcastTx(txBytes);
      console.log(`TX Hash: ${result.hash}`);
      console.log(`Code:    ${result.code}`);
    } catch (err) {
      console.error('Failed:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── Submit Job ───────────────────────────────────────────────────────────────

program
  .command('submit')
  .description('Submit a compute job')
  .requiredOption('--from <key>', 'Submitter key name')
  .requiredOption('--validator <address>', 'Target validator address')
  .requiredOption('--image <image>', 'Execution image')
  .option('--verification <image>', 'Verification image', '')
  .option('--upload-endpoint <url>', 'Upload endpoint', '')
  .option('--fetch-endpoint <url>', 'Fetch endpoint', '')
  .option('--fee-amount <amount>', 'Job fee amount', '1000000arai')
  .option('--rpc <endpoint>', 'RPC endpoint', REPUBLIC_TESTNET.rpc)
  .option('--rest <endpoint>', 'REST endpoint', REPUBLIC_TESTNET.rest)
  .option('--gas <limit>', 'Gas limit', String(DEFAULT_GAS_LIMIT))
  .option('--fees <amount>', 'Fee amount in arai', DEFAULT_FEE_AMOUNT)
  .option('--wait', 'Wait for job to be included in block', false)
  .option('--no-password', 'Skip password prompt (plaintext keys only)')
  .action(async (opts: {
    from: string; validator: string; image: string;
    verification: string; uploadEndpoint: string; fetchEndpoint: string;
    feeAmount: string; rpc: string; rest: string;
    gas: string; fees: string; wait: boolean;
    noPassword?: boolean;
  }) => {
    try {
      const key = await getDecryptedKey(opts.from, { noPassword: opts.noPassword });
      const client = new RepublicClient({ rpc: opts.rpc, rest: opts.rest });
      const jobManager = new JobManager(client, key);
      const gasLimit = parsePositiveInt(opts.gas, 'gas limit');

      if (opts.wait) {
        const { txResponse, jobId } = await jobManager.submitAndWait({
          targetValidator: opts.validator,
          executionImage: opts.image,
          verificationImage: opts.verification,
          uploadEndpoint: opts.uploadEndpoint,
          fetchEndpoint: opts.fetchEndpoint,
          feeAmount: opts.feeAmount,
          gasLimit,
          fees: opts.fees,
        });

        console.log(`TX Hash: ${txResponse.hash}`);
        console.log(`Height:  ${txResponse.height}`);
        if (jobId) console.log(`Job ID:  ${jobId}`);
      } else {
        const result = await jobManager.submitJob({
          targetValidator: opts.validator,
          executionImage: opts.image,
          verificationImage: opts.verification,
          uploadEndpoint: opts.uploadEndpoint,
          fetchEndpoint: opts.fetchEndpoint,
          feeAmount: opts.feeAmount,
          gasLimit,
          fees: opts.fees,
        });

        console.log(`TX Hash: ${result.hash}`);
      }
    } catch (err) {
      console.error('Job submission failed:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── Job Status ───────────────────────────────────────────────────────────────

program
  .command('status <job-id>')
  .description('Query job status')
  .option('--rpc <endpoint>', 'RPC endpoint', REPUBLIC_TESTNET.rpc)
  .option('--rest <endpoint>', 'REST endpoint', REPUBLIC_TESTNET.rest)
  .option('--watch', 'Watch for status updates', false)
  .option('--interval <ms>', 'Poll interval in ms', '5000')
  .action(async (jobId: string, opts: {
    rpc: string; rest: string; watch: boolean; interval: string;
  }) => {
    try {
      const client = new RepublicClient({ rpc: opts.rpc, rest: opts.rest });
      const jobManager = new JobManager(client);

      if (opts.watch) {
        const interval = parsePositiveInt(opts.interval, 'interval', 100);
        for await (const status of jobManager.watchJob(jobId, interval)) {
          console.log(`[${new Date().toISOString()}] Status: ${status.status}`);
          if (status.result) {
            console.log(`Result: ${status.result}`);
          }
        }
      } else {
        const status = await jobManager.getJobStatus(jobId);
        console.log(JSON.stringify(status, null, 2));
      }
    } catch (err) {
      console.error('Failed to query job status:', (err as Error).message);
      process.exit(1);
    }
  });

program.parse();
