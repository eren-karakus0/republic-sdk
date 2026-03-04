# Republic SDK Examples

Runnable examples demonstrating key features of the Republic SDK.

## Prerequisites

- Node.js >= 18
- A funded Republic testnet account (get tokens from the [Points Portal](https://points.republicai.io))
- Private key hex of your account

## Examples

### Basic Transfer

Send tokens from one account to another.

```bash
npx tsx examples/basic-transfer.ts <private-key-hex> <recipient-address> <amount-in-rai>
```

### Staking Operations

List validators, delegate tokens, query and withdraw rewards.

```bash
npx tsx examples/staking-operations.ts <private-key-hex> [validator-address]
```

### Job Submission

Submit a compute job to a validator and watch its status.

```bash
npx tsx examples/job-submission.ts <private-key-hex> <validator-address> <execution-image>
```

## Notes

- All examples connect to the Republic testnet by default
- Private keys are passed as CLI arguments for simplicity. In production, use the encrypted keystore via the CLI (`republic-sdk keys create`)
- Install `tsx` for TypeScript execution: `npm install -g tsx`
