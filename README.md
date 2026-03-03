# Republic SDK

TypeScript SDK for [Republic AI](https://republicai.io) blockchain — key management, transaction signing, job submission & CLI.

Republic AI is a Cosmos SDK-based blockchain with EVM compatibility (ethsecp256k1). This SDK provides a simple, type-safe interface for interacting with the Republic testnet.

## Features

- **Key Management** — Generate, import, export secp256k1 keys with ethsecp256k1 address derivation
- **RPC Client** — Query node status, account info, balances via Tendermint JSON-RPC & REST
- **Transaction Signing** — Build and sign Cosmos SDK transactions (send, delegate, redelegate)
- **Job Submission** — Submit compute jobs to validators and monitor their status
- **CLI Tool** — Command-line interface for all operations

## Installation

```bash
npm install republic-sdk
```

Or use the CLI directly:

```bash
npx republic-sdk node-status
```

## Quick Start

### Programmatic Usage

```typescript
import { RepublicKey, RepublicClient, signTx, encodeTx, msgSend } from 'republic-sdk';

// Generate a new key
const key = RepublicKey.generate();
console.log('Address:', key.getAddress()); // rai1...

// Connect to testnet
const client = new RepublicClient();

// Query node status
const status = await client.getStatus();
console.log('Block height:', status.syncInfo.latestBlockHeight);

// Query balance
const balance = await client.getBalance(key.getAddress());
console.log('Balance:', balance.amount, balance.denom);

// Send tokens
const msg = msgSend(key.getAddress(), 'rai1recipient...', [
  { denom: 'arai', amount: '1000000000000000000' }, // 1 RAI
]);

const accountInfo = await client.getAccountInfo(key.getAddress());
const signedTx = signTx(key, [msg], {
  accountNumber: accountInfo.accountNumber,
  sequence: accountInfo.sequence,
});

const result = await client.broadcastTx(encodeTx(signedTx));
console.log('TX Hash:', result.hash);
```

### Submit a Compute Job

```typescript
import { RepublicKey, RepublicClient, JobManager } from 'republic-sdk';

const key = RepublicKey.fromPrivateKey('your_hex_private_key');
const client = new RepublicClient();
const jobs = new JobManager(client, key);

const { txResponse, jobId } = await jobs.submitAndWait({
  from: key.getAddress(),
  targetValidator: 'raivaloper1...',
  executionImage: 'republic-llm-inference:latest',
  verificationImage: 'example-verification:latest',
  uploadEndpoint: 'http://example.com/upload',
  fetchEndpoint: 'http://example.com/result',
  feeAmount: '1000000arai',
});

// Watch job status
for await (const status of jobs.watchJob(jobId!)) {
  console.log('Status:', status.status);
}
```

## CLI Usage

### Key Management

```bash
# Create a new key
republic-sdk keys create my-wallet

# List all keys
republic-sdk keys list

# Show key details
republic-sdk keys show my-wallet

# Import a key from hex private key
republic-sdk keys import my-wallet <private-key-hex>

# Export private key
republic-sdk keys export my-wallet

# Delete a key
republic-sdk keys delete my-wallet
```

### Queries

```bash
# Node status
republic-sdk node-status
republic-sdk node-status --rpc https://rpc.republicai.io

# Account balance
republic-sdk balance rai1...
```

### Transactions

```bash
# Send tokens
republic-sdk send --from my-wallet --to rai1... --amount 1000000000000000000

# Delegate to validator
republic-sdk delegate --from my-wallet --validator raivaloper1... --amount 50000000000000000000
```

### Job Submission

```bash
# Submit a compute job
republic-sdk submit \
  --from my-wallet \
  --validator raivaloper1... \
  --image republic-llm-inference:latest \
  --verification example-verification:latest \
  --upload-endpoint http://localhost:8080/upload \
  --fetch-endpoint http://localhost:8080/result \
  --wait

# Check job status
republic-sdk status <job-id>

# Watch job status
republic-sdk status <job-id> --watch
```

## API Reference

### RepublicKey

| Method | Description |
|--------|-------------|
| `RepublicKey.generate()` | Create a new random key |
| `RepublicKey.fromPrivateKey(hex)` | Import from hex private key |
| `key.getAddress(prefix?)` | Get bech32 address (default: `rai`) |
| `key.publicKey` | Compressed public key (hex) |
| `key.publicKeyBase64` | Compressed public key (base64) |
| `key.sign(message)` | Sign a message (returns 64-byte compact sig) |
| `key.verify(message, sig)` | Verify a signature |

### RepublicClient

| Method | Description |
|--------|-------------|
| `new RepublicClient(config?)` | Create client (defaults to testnet) |
| `client.getStatus()` | Query node status |
| `client.getAccountInfo(address)` | Get account number & sequence |
| `client.getBalances(address)` | Get all balances |
| `client.getBalance(address, denom?)` | Get specific denom balance |
| `client.broadcastTx(txBytes, mode?)` | Broadcast signed transaction |
| `client.getTx(hash)` | Query transaction by hash |
| `client.waitForTx(hash, timeout?)` | Wait for tx inclusion |

### Transaction Builders

| Function | Description |
|----------|-------------|
| `msgSend(from, to, amount)` | Build MsgSend |
| `msgDelegate(delegator, validator, amount)` | Build MsgDelegate |
| `msgUndelegate(delegator, validator, amount)` | Build MsgUndelegate |
| `msgRedelegate(delegator, src, dst, amount)` | Build MsgBeginRedelegate |
| `msgSubmitJob(params)` | Build MsgSubmitJob |
| `signTx(key, messages, options)` | Sign a transaction |
| `encodeTx(signedTx)` | Encode for broadcasting |

### JobManager

| Method | Description |
|--------|-------------|
| `jobs.submitJob(params)` | Submit a compute job |
| `jobs.submitAndWait(params)` | Submit and wait for block inclusion |
| `jobs.getJobStatus(jobId)` | Query job status |
| `jobs.watchJob(jobId)` | AsyncGenerator for real-time status |

## Chain Configuration

| Parameter | Value |
|-----------|-------|
| Chain ID | `raitestnet_77701-1` |
| EVM Chain ID | `77701` |
| Address Prefix | `rai` |
| Validator Prefix | `raivaloper` |
| Denom | `arai` |
| RPC | `https://rpc.republicai.io` |
| REST | `https://rest.republicai.io` |
| EVM RPC | `https://evm-rpc.republicai.io` |

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Watch mode
npm run dev
```

## Technical Details

- Uses **ethsecp256k1** for key management (Keccak256 address derivation, like Ethereum)
- Compatible with Cosmos SDK transaction format
- Supports both ESM and CommonJS
- Built with TypeScript for full type safety
- Uses `@noble/secp256k1` and `@noble/hashes` (audited cryptographic libraries)

## License

MIT
