# Republic SDK

[![CI](https://github.com/eren-karakus0/republic-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/eren-karakus0/republic-sdk/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

TypeScript SDK for [Republic AI](https://republicai.io) blockchain — key management, transaction signing, staking, governance & CLI.

Republic AI is a Cosmos SDK-based blockchain with EVM compatibility (ethsecp256k1). This SDK provides a simple, type-safe interface for interacting with the Republic testnet.

## Features

- **Key Management** — Generate, import, export secp256k1 keys with ethsecp256k1 address derivation
- **RPC Client** — Query node status, account info, balances with automatic retry & exponential backoff
- **Staking Queries** — Validators, delegations, rewards
- **Governance** — Query proposals, submit votes
- **Transaction Signing** — Build and sign Cosmos SDK transactions (send, delegate, withdraw rewards, vote)
- **Job Submission** — Submit compute jobs to validators and monitor their status
- **Error Handling** — Typed error hierarchy (`RpcError`, `BroadcastError`, `TimeoutError`, etc.)
- **CLI Tool** — Full command-line interface for all operations
- **Dual Module** — ESM + CommonJS + TypeScript declarations

## Installation

Install directly from GitHub:

```bash
npm install github:eren-karakus0/republic-sdk
```

Or clone and build from source:

```bash
git clone https://github.com/eren-karakus0/republic-sdk.git
cd republic-sdk
npm install && npm run build
```

<!-- TODO: npm install republic-sdk (after npm publish) -->

## Quick Start

### Programmatic Usage

```typescript
import { RepublicKey, RepublicClient, signTx, msgSend } from 'republic-sdk';

// Generate a new key
const key = RepublicKey.generate();
console.log('Address:', key.getAddress()); // rai1...

// Connect to testnet (with automatic retry)
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

const accountInfo = await client.getAccountInfoSafe(key.getAddress());
const txBytes = signTx(key, [msg], {
  accountNumber: accountInfo.accountNumber,
  sequence: accountInfo.sequence,
});

const result = await client.broadcastTx(txBytes);
console.log('TX Hash:', result.hash);
```

### Staking & Governance

```typescript
import { RepublicClient, msgWithdrawReward, msgVote } from 'republic-sdk';

const client = new RepublicClient();

// Query validators
const validators = await client.getValidators('BOND_STATUS_BONDED');
validators.forEach(v => console.log(v.moniker, v.tokens));

// Query delegations & rewards
const delegations = await client.getDelegations('rai1...');
const rewards = await client.getRewards('rai1...');

// Query governance proposals
const proposals = await client.getProposals();

// Build withdraw & vote messages
const withdrawMsg = msgWithdrawReward('rai1delegator', 'raivaloper1validator');
const voteMsg = msgVote('1', 'rai1voter', 1); // 1=Yes, 2=Abstain, 3=No, 4=NoWithVeto
```

### Submit a Compute Job

```typescript
import { RepublicKey, RepublicClient, JobManager } from 'republic-sdk';

const key = RepublicKey.fromPrivateKey('your_hex_private_key');
const client = new RepublicClient();
const jobs = new JobManager(client, key);

const { txResponse, jobId } = await jobs.submitAndWait({
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

### Error Handling

```typescript
import { RepublicClient, RpcError, BroadcastError, TimeoutError } from 'republic-sdk';

try {
  const client = new RepublicClient();
  await client.broadcastTx(txBytes);
} catch (err) {
  if (err instanceof BroadcastError) {
    console.error(`TX failed (code ${err.code}): ${err.log}`);
  } else if (err instanceof RpcError) {
    console.error(`RPC error at ${err.endpoint}: ${err.message}`);
  } else if (err instanceof TimeoutError) {
    console.error('Operation timed out');
  }
}
```

### Retry Configuration

```typescript
const client = new RepublicClient(
  { rpc: 'https://rpc.republicai.io' },
  { retryOptions: { maxRetries: 5, baseDelayMs: 2000, maxDelayMs: 15000 } }
);
```

### Amount Utilities

```typescript
import { araiToRai, raiToArai } from 'republic-sdk';

araiToRai('1000000000000000000'); // '1'
araiToRai('1500000000000000000'); // '1.5'
raiToArai('2.5');                 // '2500000000000000000'
```

## CLI Usage

### Key Management

```bash
republic-sdk keys create my-wallet
republic-sdk keys list
republic-sdk keys show my-wallet
republic-sdk keys import my-wallet <private-key-hex>
republic-sdk keys export my-wallet
republic-sdk keys delete my-wallet
```

### Queries

```bash
# Node status
republic-sdk node-status

# Account balance
republic-sdk balance rai1...

# Validator list
republic-sdk validators
republic-sdk validators --status BOND_STATUS_BONDED

# Delegations
republic-sdk delegations rai1...

# Staking rewards
republic-sdk rewards rai1...
```

### Transactions

```bash
# Send tokens
republic-sdk send --from my-wallet --to rai1... --amount 1000000000000000000

# Delegate to validator
republic-sdk delegate --from my-wallet --validator raivaloper1... --amount 50000000000000000000

# Withdraw staking rewards
republic-sdk withdraw-rewards --from my-wallet --validator raivaloper1...

# Vote on governance proposal
republic-sdk vote --from my-wallet --proposal 1 --option yes
```

### Job Submission

```bash
# Submit a compute job
republic-sdk submit \
  --from my-wallet \
  --validator raivaloper1... \
  --image republic-llm-inference:latest \
  --wait

# Check job status
republic-sdk status <job-id>
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
| `key.sign(message)` | Sign a message (returns 64-byte compact sig) |
| `key.verify(message, sig)` | Verify a signature |

### RepublicClient

| Method | Description |
|--------|-------------|
| `new RepublicClient(config?, options?)` | Create client with retry options |
| `client.getStatus()` | Query node status |
| `client.getAccountInfo(address)` | Get account number & sequence |
| `client.getAccountInfoSafe(address)` | Same, returns defaults for new accounts |
| `client.getBalances(address)` | Get all balances |
| `client.getBalance(address, denom?)` | Get specific denom balance |
| `client.broadcastTx(txBytes, mode?)` | Broadcast signed transaction |
| `client.getTx(hash)` | Query transaction by hash |
| `client.waitForTx(hash, timeout?)` | Wait for tx inclusion |
| `client.getValidators(status?)` | List validators |
| `client.getValidator(address)` | Get validator details |
| `client.getDelegations(address)` | List delegations |
| `client.getDelegation(delegator, validator)` | Get specific delegation |
| `client.getRewards(address)` | Get all staking rewards |
| `client.getReward(delegator, validator)` | Get specific reward |
| `client.getProposals(status?)` | List governance proposals |
| `client.getProposal(id)` | Get proposal details |

### Transaction Builders

| Function | Description |
|----------|-------------|
| `msgSend(from, to, amount)` | Build MsgSend |
| `msgDelegate(delegator, validator, amount)` | Build MsgDelegate |
| `msgUndelegate(delegator, validator, amount)` | Build MsgUndelegate |
| `msgRedelegate(delegator, src, dst, amount)` | Build MsgBeginRedelegate |
| `msgWithdrawReward(delegator, validator)` | Build MsgWithdrawDelegatorReward |
| `msgVote(proposalId, voter, option)` | Build MsgVote |
| `msgSubmitJob(params)` | Build MsgSubmitJob |
| `signTx(key, messages, options)` | Sign and encode tx (returns base64 TxRaw) |

### Error Classes

| Class | Description |
|-------|-------------|
| `RepublicError` | Base error class |
| `RpcError` | RPC connection errors (code, endpoint) |
| `RestError` | REST API errors (statusCode, endpoint) |
| `BroadcastError` | TX broadcast errors (code, log, hash) |
| `TimeoutError` | Polling/wait timeouts |
| `ValidationError` | Input validation errors |
| `AccountNotFoundError` | Account 404 (address) |

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
npm install       # Install dependencies
npm run lint      # Lint (src, bin, tests)
npm run test      # Run 105 tests
npm run build     # Build ESM + CJS + DTS
npm run dev       # Watch mode
```

## Technical Details

- Uses **ethsecp256k1** for key management (Keccak256 address derivation)
- Minimal protobuf encoder (no heavy dependencies)
- Automatic retry with exponential backoff for network resilience
- Typed error hierarchy for programmatic error handling
- Compatible with Cosmos SDK transaction format
- Uses `@noble/secp256k1` and `@noble/hashes` (audited cryptographic libraries)
- Supports both ESM and CommonJS

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## Security

See [SECURITY.md](SECURITY.md) for security policy and responsible disclosure.

## License

MIT
