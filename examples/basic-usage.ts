/**
 * Basic usage example for Republic SDK
 *
 * This example demonstrates:
 * - Creating and importing keys
 * - Querying node status and balances
 * - Building and signing a send transaction
 */
import {
  RepublicKey,
  RepublicClient,
  signTx,
  msgSend,
  msgDelegate,
  REPUBLIC_TESTNET,
} from '../src/index';

async function main() {
  // 1. Create a new key or import an existing one
  const key = RepublicKey.generate();
  console.log('New key generated:');
  console.log('  Address:', key.getAddress());
  console.log('  Public Key:', key.publicKey);

  // Import from hex private key
  // const imported = RepublicKey.fromPrivateKey('your_private_key_hex');

  // 2. Connect to Republic testnet
  const client = new RepublicClient();

  // 3. Query node status
  const status = await client.getStatus();
  console.log('\nNode Status:');
  console.log('  Network:', status.nodeInfo.network);
  console.log('  Height:', status.syncInfo.latestBlockHeight);
  console.log('  Catching up:', status.syncInfo.catchingUp);

  // 4. Query balance
  const address = key.getAddress();
  const balance = await client.getBalance(address);
  console.log('\nBalance:');
  console.log(`  ${balance.amount} ${balance.denom}`);

  // 5. Build and sign a send transaction (requires funded account)
  const recipientAddress = 'rai1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
  const msg = msgSend(address, recipientAddress, [
    { denom: REPUBLIC_TESTNET.denom, amount: '1000000000000000000' }, // 1 RAI
  ]);

  const accountInfo = await client.getAccountInfo(address);

  // signTx returns base64-encoded TxRaw bytes (protobuf)
  const txBytes = signTx(key, [msg], {
    accountNumber: accountInfo.accountNumber,
    sequence: accountInfo.sequence,
    memo: 'Sent via Republic SDK',
  });

  console.log('\nSigned TX (not broadcasting - account not funded):');
  console.log('  Encoded length:', Buffer.from(txBytes, 'base64').length, 'bytes');

  // 6. To broadcast:
  // const result = await client.broadcastTx(txBytes);
  // console.log('TX Hash:', result.hash);

  // 7. Delegate to a validator
  const delegateMsg = msgDelegate(address, 'raivaloper1...', {
    denom: REPUBLIC_TESTNET.denom,
    amount: '50000000000000000000', // 50 RAI
  });
  console.log('\nDelegate message type:', delegateMsg['@type']);
}

main().catch(console.error);
