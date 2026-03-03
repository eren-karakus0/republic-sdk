import { describe, it, expect } from 'vitest';
import { RepublicKey } from '../src/key';
import {
  signTx,
  buildFee,
  msgSend,
  msgDelegate,
  msgUndelegate,
  msgRedelegate,
  msgSubmitJob,
} from '../src/transaction';
import { MSG_TYPES } from '../src/constants';

const TEST_PRIVATE_KEY =
  'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

describe('Message builders', () => {
  it('msgSend should create correct message', () => {
    const msg = msgSend('rai1sender', 'rai1receiver', [
      { denom: 'arai', amount: '1000000' },
    ]);
    expect(msg['@type']).toBe(MSG_TYPES.SEND);
    expect(msg.from_address).toBe('rai1sender');
    expect(msg.to_address).toBe('rai1receiver');
    expect(msg.amount).toEqual([{ denom: 'arai', amount: '1000000' }]);
  });

  it('msgDelegate should create correct message', () => {
    const msg = msgDelegate('rai1del', 'raivaloper1val', {
      denom: 'arai',
      amount: '5000000',
    });
    expect(msg['@type']).toBe(MSG_TYPES.DELEGATE);
    expect(msg.delegator_address).toBe('rai1del');
    expect(msg.validator_address).toBe('raivaloper1val');
  });

  it('msgUndelegate should create correct message', () => {
    const msg = msgUndelegate('rai1del', 'raivaloper1val', {
      denom: 'arai',
      amount: '5000000',
    });
    expect(msg['@type']).toBe(MSG_TYPES.UNDELEGATE);
  });

  it('msgRedelegate should create correct message', () => {
    const msg = msgRedelegate('rai1del', 'raivaloper1src', 'raivaloper1dst', {
      denom: 'arai',
      amount: '5000000',
    });
    expect(msg['@type']).toBe(MSG_TYPES.REDELEGATE);
    expect(msg.validator_src_address).toBe('raivaloper1src');
    expect(msg.validator_dst_address).toBe('raivaloper1dst');
  });

  it('msgSubmitJob should create correct message', () => {
    const msg = msgSubmitJob({
      creator: 'rai1creator',
      targetValidator: 'raivaloper1val',
      executionImage: 'test-image:latest',
      verificationImage: 'verify-image:latest',
      uploadEndpoint: 'http://localhost/upload',
      fetchEndpoint: 'http://localhost/fetch',
      feeAmount: '1000000arai',
    });
    expect(msg['@type']).toBe(MSG_TYPES.SUBMIT_JOB);
    expect(msg.creator).toBe('rai1creator');
    expect(msg.execution_image).toBe('test-image:latest');
  });
});

describe('buildFee', () => {
  it('should create valid fee with defaults', () => {
    const fee = buildFee();
    expect(fee.gasLimit).toBe('200000');
    expect(fee.amount[0].denom).toBe('arai');
  });

  it('should create valid fee with custom values', () => {
    const fee = buildFee(300000, '50000', 'arai');
    expect(fee.gasLimit).toBe('300000');
    expect(fee.amount[0].amount).toBe('50000');
  });
});

describe('Transaction signing (protobuf)', () => {
  it('should return a base64-encoded TxRaw', () => {
    const key = RepublicKey.fromPrivateKey(TEST_PRIVATE_KEY);
    const msg = msgSend(key.getAddress(), 'rai1receiver', [
      { denom: 'arai', amount: '1000000' },
    ]);

    const txBytes = signTx(key, [msg], {
      accountNumber: '42',
      sequence: '7',
      gasLimit: 200000,
      feeAmount: '20000000000000000',
    });

    // Should be valid base64
    expect(typeof txBytes).toBe('string');
    const raw = Buffer.from(txBytes, 'base64');
    expect(raw.length).toBeGreaterThan(0);

    // First byte should be a protobuf field tag (field 1, wire type 2 = 0x0a)
    expect(raw[0]).toBe(0x0a);
  });

  it('should be deterministic (same inputs -> same output)', () => {
    const key = RepublicKey.fromPrivateKey(TEST_PRIVATE_KEY);
    const msg = msgSend(key.getAddress(), 'rai1receiver', [
      { denom: 'arai', amount: '1000000' },
    ]);
    const opts = { accountNumber: '42', sequence: '7' };

    const tx1 = signTx(key, [msg], opts);
    const tx2 = signTx(key, [msg], opts);
    expect(tx1).toBe(tx2);
  });

  it('should produce different output for different sequences', () => {
    const key = RepublicKey.fromPrivateKey(TEST_PRIVATE_KEY);
    const msg = msgSend(key.getAddress(), 'rai1receiver', [
      { denom: 'arai', amount: '1000000' },
    ]);

    const tx1 = signTx(key, [msg], { accountNumber: '42', sequence: '7' });
    const tx2 = signTx(key, [msg], { accountNumber: '42', sequence: '8' });
    expect(tx1).not.toBe(tx2);
  });

  it('should produce different output for different messages', () => {
    const key = RepublicKey.fromPrivateKey(TEST_PRIVATE_KEY);
    const msg1 = msgSend(key.getAddress(), 'rai1a', [
      { denom: 'arai', amount: '100' },
    ]);
    const msg2 = msgSend(key.getAddress(), 'rai1b', [
      { denom: 'arai', amount: '200' },
    ]);
    const opts = { accountNumber: '0', sequence: '0' };

    const tx1 = signTx(key, [msg1], opts);
    const tx2 = signTx(key, [msg2], opts);
    expect(tx1).not.toBe(tx2);
  });
});
