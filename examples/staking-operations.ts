/**
 * Staking Operations Example
 *
 * Demonstrates staking-related operations:
 * 1. List validators
 * 2. Delegate tokens to a validator
 * 3. Query delegations and rewards
 * 4. Withdraw staking rewards
 *
 * Usage:
 *   npx tsx examples/staking-operations.ts <private-key-hex> [validator-address]
 *
 * If validator-address is omitted, the first bonded validator is used.
 */

import {
  RepublicKey,
  RepublicClient,
  signTx,
  msgDelegate,
  msgWithdrawReward,
  araiToRai,
  raiToArai,
  REPUBLIC_TESTNET,
} from '../src/index.js';

async function main() {
  const [privateKeyHex, validatorAddr] = process.argv.slice(2);

  if (!privateKeyHex) {
    console.error('Usage: npx tsx examples/staking-operations.ts <private-key-hex> [validator-address]');
    process.exit(1);
  }

  const key = RepublicKey.fromPrivateKey(privateKeyHex);
  const address = key.getAddress();
  const client = new RepublicClient();

  // 1. List validators
  console.log('=== Validators ===');
  const validators = await client.getValidators('BOND_STATUS_BONDED');
  for (const v of validators.slice(0, 5)) {
    console.log(`  ${v.moniker.padEnd(20)} ${v.operatorAddress} (${araiToRai(v.tokens)} RAI)`);
  }
  if (validators.length > 5) {
    console.log(`  ... and ${validators.length - 5} more`);
  }

  // Pick validator
  const targetValidator = validatorAddr || validators[0]?.operatorAddress;
  if (!targetValidator) {
    console.error('No validators found.');
    process.exit(1);
  }
  console.log(`\nUsing validator: ${targetValidator}`);

  // 2. Query current delegations
  console.log('\n=== Current Delegations ===');
  const delegations = await client.getDelegations(address);
  if (delegations.length === 0) {
    console.log('  No delegations found.');
  } else {
    for (const d of delegations) {
      const amount = d.balance.denom === 'arai' ? `${araiToRai(d.balance.amount)} RAI` : `${d.balance.amount} ${d.balance.denom}`;
      console.log(`  ${d.validatorAddress} → ${amount}`);
    }
  }

  // 3. Delegate 1 RAI
  console.log('\n=== Delegating 1 RAI ===');
  const accountInfo = await client.getAccountInfoSafe(address);
  const delegateMsg = msgDelegate(address, targetValidator, {
    denom: REPUBLIC_TESTNET.denom,
    amount: raiToArai('1'),
  });

  const txBytes = signTx(key, [delegateMsg], {
    accountNumber: accountInfo.accountNumber,
    sequence: accountInfo.sequence,
    memo: 'Delegated via republic-sdk',
  });

  const result = await client.broadcastTx(txBytes);
  console.log(`TX Hash: ${result.hash}`);

  if (result.code === 0) {
    console.log('Waiting for confirmation...');
    const txResponse = await client.waitForTx(result.hash, 30000);
    console.log(`Confirmed at block ${txResponse.height}`);
  } else {
    console.log(`TX failed (code ${result.code}): ${result.log}`);
  }

  // 4. Query rewards
  console.log('\n=== Staking Rewards ===');
  const rewards = await client.getRewards(address);
  if (rewards.length === 0) {
    console.log('  No rewards found.');
  } else {
    for (const r of rewards) {
      console.log(`  Validator: ${r.validatorAddress}`);
      for (const coin of r.reward) {
        const amount = coin.denom === 'arai' ? `${araiToRai(coin.amount)} RAI` : `${coin.amount} ${coin.denom}`;
        console.log(`    ${amount}`);
      }
    }
  }

  // 5. Withdraw rewards (if any)
  if (rewards.length > 0) {
    console.log('\n=== Withdrawing Rewards ===');
    const freshAccountInfo = await client.getAccountInfoSafe(address);
    const withdrawMsg = msgWithdrawReward(address, rewards[0].validatorAddress);
    const withdrawTxBytes = signTx(key, [withdrawMsg], {
      accountNumber: freshAccountInfo.accountNumber,
      sequence: freshAccountInfo.sequence,
    });

    const withdrawResult = await client.broadcastTx(withdrawTxBytes);
    console.log(`TX Hash: ${withdrawResult.hash}`);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
