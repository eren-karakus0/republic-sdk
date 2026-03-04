/**
 * Basic Transfer Example
 *
 * Demonstrates a complete token transfer flow:
 * 1. Import key from private key hex
 * 2. Query sender balance
 * 3. Build and sign a send transaction
 * 4. Broadcast and wait for confirmation
 *
 * Usage:
 *   npx tsx examples/basic-transfer.ts <private-key-hex> <recipient-address> <amount-in-rai>
 *
 * Example:
 *   npx tsx examples/basic-transfer.ts abc123...def rai1recipient... 0.5
 */

import {
  RepublicKey,
  RepublicClient,
  signTx,
  msgSend,
  araiToRai,
  raiToArai,
  REPUBLIC_TESTNET,
} from '../src/index.js';

async function main() {
  const [privateKeyHex, recipient, amountRai] = process.argv.slice(2);

  if (!privateKeyHex || !recipient || !amountRai) {
    console.error('Usage: npx tsx examples/basic-transfer.ts <private-key-hex> <recipient> <amount-rai>');
    console.error('Example: npx tsx examples/basic-transfer.ts abc123 rai1... 0.5');
    process.exit(1);
  }

  // 1. Import key
  const key = RepublicKey.fromPrivateKey(privateKeyHex);
  const address = key.getAddress();
  console.log(`Sender:    ${address}`);
  console.log(`Recipient: ${recipient}`);

  // 2. Connect and query balance
  const client = new RepublicClient();
  const balance = await client.getBalance(address);
  console.log(`Balance:   ${araiToRai(balance.amount)} RAI`);

  // 3. Convert amount and build message
  const amountArai = raiToArai(amountRai);
  console.log(`Sending:   ${amountRai} RAI (${amountArai} arai)`);

  const msg = msgSend(address, recipient, [
    { denom: REPUBLIC_TESTNET.denom, amount: amountArai },
  ]);

  // 4. Get account info and sign
  const accountInfo = await client.getAccountInfoSafe(address);
  const txBytes = signTx(key, [msg], {
    accountNumber: accountInfo.accountNumber,
    sequence: accountInfo.sequence,
    memo: 'Sent via republic-sdk',
  });

  // 5. Broadcast
  console.log('Broadcasting transaction...');
  const result = await client.broadcastTx(txBytes);
  console.log(`TX Hash: ${result.hash}`);

  if (result.code !== 0) {
    console.error(`TX failed with code ${result.code}: ${result.log}`);
    process.exit(1);
  }

  // 6. Wait for confirmation
  console.log('Waiting for confirmation...');
  const txResponse = await client.waitForTx(result.hash, 30000);
  console.log(`Confirmed at block ${txResponse.height}`);
  console.log(`Gas used: ${txResponse.gasUsed}`);

  // 7. Check new balance
  const newBalance = await client.getBalance(address);
  console.log(`New balance: ${araiToRai(newBalance.amount)} RAI`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
