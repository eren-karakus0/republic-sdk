import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { RepublicKey } from '../src/key.js';
import { RepublicClient } from '../src/client.js';
import { JobManager } from '../src/job.js';
import { signTx, msgSend, msgDelegate } from '../src/transaction.js';
import { REPUBLIC_TESTNET, DEFAULT_GAS_LIMIT, DEFAULT_FEE_AMOUNT } from '../src/constants.js';
import type { KeyStore } from '../src/types.js';

const CONFIG_DIR = join(homedir(), '.republic-sdk');
const KEYS_FILE = join(CONFIG_DIR, 'keys.json');

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadKeys(): KeyStore {
  if (!existsSync(KEYS_FILE)) return {};
  const raw = readFileSync(KEYS_FILE, 'utf-8');
  return JSON.parse(raw) as KeyStore;
}

function saveKeys(store: KeyStore): void {
  ensureConfigDir();
  writeFileSync(KEYS_FILE, JSON.stringify(store, null, 2), 'utf-8');
  try {
    chmodSync(KEYS_FILE, 0o600);
  } catch {
    // chmod may not work on Windows
  }
}

function getKey(name: string): RepublicKey {
  const store = loadKeys();
  const entry = store[name];
  if (!entry) {
    console.error(`Key "${name}" not found. Use 'keys list' to see available keys.`);
    process.exit(1);
  }
  return RepublicKey.fromPrivateKey(entry.privateKey);
}

function parseGas(value: string): number {
  const n = parseInt(value, 10);
  if (isNaN(n) || n <= 0) {
    console.error(`Invalid gas limit: "${value}". Must be a positive integer.`);
    process.exit(1);
  }
  return n;
}

function parseInterval(value: string): number {
  const n = parseInt(value, 10);
  if (isNaN(n) || n < 100) {
    console.error(`Invalid interval: "${value}". Must be >= 100ms.`);
    process.exit(1);
  }
  return n;
}

const program = new Command();

program
  .name('republic-sdk')
  .description('CLI for Republic AI blockchain')
  .version('0.1.0');

// ─── Keys ─────────────────────────────────────────────────────────────────────

const keys = program.command('keys').description('Key management');

keys
  .command('create <name>')
  .description('Create a new key pair')
  .action((name: string) => {
    const store = loadKeys();
    if (store[name]) {
      console.error(`Key "${name}" already exists.`);
      process.exit(1);
    }

    const key = RepublicKey.generate();
    const address = key.getAddress();

    store[name] = {
      privateKey: key.privateKey,
      address,
      publicKey: key.publicKey,
    };
    saveKeys(store);

    console.log(`Key created: ${name}`);
    console.log(`Address:     ${address}`);
    console.log(`Public Key:  ${key.publicKey}`);
  });

keys
  .command('list')
  .description('List all stored keys')
  .action(() => {
    const store = loadKeys();
    const names = Object.keys(store);

    if (names.length === 0) {
      console.log('No keys found.');
      return;
    }

    console.log('Name'.padEnd(20) + 'Address');
    console.log('-'.repeat(60));
    for (const name of names) {
      console.log(name.padEnd(20) + store[name].address);
    }
  });

keys
  .command('show <name>')
  .description('Show key details')
  .action((name: string) => {
    const store = loadKeys();
    const entry = store[name];
    if (!entry) {
      console.error(`Key "${name}" not found.`);
      process.exit(1);
    }

    console.log(`Name:       ${name}`);
    console.log(`Address:    ${entry.address}`);
    console.log(`Public Key: ${entry.publicKey}`);
  });

keys
  .command('import <name> <private-key>')
  .description('Import a key from hex private key')
  .action((name: string, privateKeyHex: string) => {
    const store = loadKeys();
    if (store[name]) {
      console.error(`Key "${name}" already exists.`);
      process.exit(1);
    }

    try {
      const key = RepublicKey.fromPrivateKey(privateKeyHex);
      const address = key.getAddress();

      store[name] = {
        privateKey: key.privateKey,
        address,
        publicKey: key.publicKey,
      };
      saveKeys(store);

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
  .action((name: string) => {
    const store = loadKeys();
    const entry = store[name];
    if (!entry) {
      console.error(`Key "${name}" not found.`);
      process.exit(1);
    }

    console.log(entry.privateKey);
  });

keys
  .command('delete <name>')
  .description('Delete a stored key')
  .action((name: string) => {
    const store = loadKeys();
    if (!store[name]) {
      console.error(`Key "${name}" not found.`);
      process.exit(1);
    }

    delete store[name];
    saveKeys(store);
    console.log(`Key "${name}" deleted.`);
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
        const amount = BigInt(coin.amount);
        const whole = amount / BigInt(10 ** 18);
        const frac = amount % BigInt(10 ** 18);
        const fracStr = frac.toString().padStart(18, '0').slice(0, 4);
        console.log(`${whole}.${fracStr} RAI (${coin.amount} ${coin.denom})`);
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
  .action(async (opts: {
    from: string; to: string; amount: string;
    rpc: string; rest: string; memo: string; gas: string; fees: string;
  }) => {
    try {
      const key = getKey(opts.from);
      const client = new RepublicClient({ rpc: opts.rpc, rest: opts.rest });
      const address = key.getAddress();
      const accountInfo = await client.getAccountInfo(address);

      const msg = msgSend(address, opts.to, [
        { denom: REPUBLIC_TESTNET.denom, amount: opts.amount },
      ]);

      const txBytes = signTx(key, [msg], {
        accountNumber: accountInfo.accountNumber,
        sequence: accountInfo.sequence,
        gasLimit: parseGas(opts.gas),
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
  .action(async (opts: {
    from: string; validator: string; amount: string;
    rpc: string; rest: string; memo: string; gas: string; fees: string;
  }) => {
    try {
      const key = getKey(opts.from);
      const client = new RepublicClient({ rpc: opts.rpc, rest: opts.rest });
      const address = key.getAddress();
      const accountInfo = await client.getAccountInfo(address);

      const msg = msgDelegate(address, opts.validator, {
        denom: REPUBLIC_TESTNET.denom,
        amount: opts.amount,
      });

      const txBytes = signTx(key, [msg], {
        accountNumber: accountInfo.accountNumber,
        sequence: accountInfo.sequence,
        gasLimit: parseGas(opts.gas),
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
  .action(async (opts: {
    from: string; validator: string; image: string;
    verification: string; uploadEndpoint: string; fetchEndpoint: string;
    feeAmount: string; rpc: string; rest: string;
    gas: string; fees: string; wait: boolean;
  }) => {
    try {
      const key = getKey(opts.from);
      const client = new RepublicClient({ rpc: opts.rpc, rest: opts.rest });
      const jobManager = new JobManager(client, key);
      const gasLimit = parseGas(opts.gas);

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
      const key = RepublicKey.generate();
      const jobManager = new JobManager(client, key);

      if (opts.watch) {
        const interval = parseInterval(opts.interval);
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
