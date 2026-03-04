/**
 * Integration tests - run against live Republic testnet.
 *
 * Skipped by default. Set REPUBLIC_INTEGRATION=1 to enable.
 * Requires REPUBLIC_TEST_KEY (hex private key) and REPUBLIC_TEST_ADDRESS env vars.
 *
 * Usage:
 *   REPUBLIC_INTEGRATION=1 REPUBLIC_TEST_KEY=<hex> REPUBLIC_TEST_ADDRESS=<rai1...> npm run test:integration
 */

import { describe, it, expect } from 'vitest';
import { RepublicKey } from '../src/key.js';
import { RepublicClient } from '../src/client.js';
import { signTx, msgSend } from '../src/transaction.js';
import { REPUBLIC_TESTNET } from '../src/constants.js';

const SKIP = !process.env.REPUBLIC_INTEGRATION;
const describeIntegration = SKIP ? describe.skip : describe;

const TEST_KEY = process.env.REPUBLIC_TEST_KEY ?? '';
const TEST_ADDRESS = process.env.REPUBLIC_TEST_ADDRESS ?? '';

describeIntegration('Integration Tests (live chain)', () => {
  const client = new RepublicClient(undefined, {
    retryOptions: { maxRetries: 3, baseDelayMs: 2000 },
  });

  it('should connect to node and get status', async () => {
    const status = await client.getStatus();
    expect(status.nodeInfo.network).toBeTruthy();
    expect(Number(status.syncInfo.latestBlockHeight)).toBeGreaterThan(0);
  }, { timeout: 30000 });

  it('should query balance for test address', async () => {
    const balances = await client.getBalances(TEST_ADDRESS);
    expect(Array.isArray(balances)).toBe(true);
    // Test account should have some balance
    expect(balances.length).toBeGreaterThan(0);
  }, { timeout: 30000 });

  it('should query account info', async () => {
    const accountInfo = await client.getAccountInfo(TEST_ADDRESS);
    expect(accountInfo.address).toBeTruthy();
    expect(accountInfo.accountNumber).toBeDefined();
    expect(accountInfo.sequence).toBeDefined();
  }, { timeout: 30000 });

  it('should list validators', async () => {
    const validators = await client.getValidators();
    expect(validators.length).toBeGreaterThan(0);
    expect(validators[0].operatorAddress).toBeTruthy();
    expect(validators[0].moniker).toBeTruthy();
  }, { timeout: 30000 });

  it('should get specific validator', async () => {
    const validators = await client.getValidators();
    const first = validators[0];
    const validator = await client.getValidator(first.operatorAddress);
    expect(validator.operatorAddress).toBe(first.operatorAddress);
  }, { timeout: 30000 });

  it('should query delegations', async () => {
    const delegations = await client.getDelegations(TEST_ADDRESS);
    expect(Array.isArray(delegations)).toBe(true);
  }, { timeout: 30000 });

  it('should query rewards', async () => {
    const rewards = await client.getRewards(TEST_ADDRESS);
    expect(Array.isArray(rewards)).toBe(true);
  }, { timeout: 30000 });

  // TX tests - sequential, self-transfer
  describe('Transaction broadcast', () => {
    let txHash: string;

    it('should broadcast a self-transfer', async () => {
      const key = RepublicKey.fromPrivateKey(TEST_KEY);
      const address = key.getAddress();
      expect(address).toBe(TEST_ADDRESS);

      const accountInfo = await client.getAccountInfoSafe(address);

      const msg = msgSend(address, address, [
        { denom: REPUBLIC_TESTNET.denom, amount: '1' }, // 1 arai (minimal)
      ]);

      const txBytes = signTx(key, [msg], {
        accountNumber: accountInfo.accountNumber,
        sequence: accountInfo.sequence,
      });

      const result = await client.broadcastTx(txBytes);
      expect(result.hash).toBeTruthy();
      expect(result.hash).toHaveLength(64);
      txHash = result.hash;
    }, { timeout: 60000 });

    it('should wait for TX inclusion', async () => {
      expect(txHash).toBeTruthy();
      const txResponse = await client.waitForTx(txHash, 30000);
      expect(txResponse.hash).toBe(txHash);
      expect(txResponse.height).toBeTruthy();
    }, { timeout: 60000 });

    it('should query broadcasted TX', async () => {
      expect(txHash).toBeTruthy();
      const txResponse = await client.getTx(txHash);
      expect(txResponse.hash).toBe(txHash);
      expect(Number(txResponse.height)).toBeGreaterThan(0);
    }, { timeout: 30000 });
  });
});
