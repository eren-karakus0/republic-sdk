import { describe, it, expect } from 'vitest';
import { RepublicKey } from '../src/key';
import {
  signTx,
  encodeTx,
  buildTxBody,
  buildAuthInfo,
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

describe('Transaction building', () => {
  it('buildTxBody should create valid body', () => {
    const msg = msgSend('rai1a', 'rai1b', [
      { denom: 'arai', amount: '100' },
    ]);
    const body = buildTxBody([msg], 'test memo');

    expect(body.messages).toHaveLength(1);
    expect(body.memo).toBe('test memo');
    expect(body.timeoutHeight).toBe('0');
  });

  it('buildFee should create valid fee', () => {
    const fee = buildFee(200000, '20000000000000000', 'arai');
    expect(fee.gasLimit).toBe('200000');
    expect(fee.amount[0].amount).toBe('20000000000000000');
  });

  it('buildAuthInfo should create valid auth info', () => {
    const key = RepublicKey.fromPrivateKey(TEST_PRIVATE_KEY);
    const fee = buildFee();
    const authInfo = buildAuthInfo(key.publicKeyBase64, '5', fee);

    expect(authInfo.signerInfos).toHaveLength(1);
    expect(authInfo.signerInfos[0].sequence).toBe('5');
    expect(authInfo.signerInfos[0].publicKey['@type']).toBe(
      '/cosmos.crypto.secp256k1.PubKey',
    );
    expect(authInfo.signerInfos[0].modeInfo.single.mode).toBe(
      'SIGN_MODE_DIRECT',
    );
  });
});

describe('Transaction signing', () => {
  it('should sign a transaction and produce valid output', () => {
    const key = RepublicKey.fromPrivateKey(TEST_PRIVATE_KEY);
    const msg = msgSend(key.getAddress(), 'rai1receiver', [
      { denom: 'arai', amount: '1000000' },
    ]);

    const signedTx = signTx(key, [msg], {
      accountNumber: '42',
      sequence: '7',
      gasLimit: 200000,
      feeAmount: '20000000000000000',
    });

    // Verify structure
    expect(signedTx.body.messages).toHaveLength(1);
    expect(signedTx.auth_info.signerInfos).toHaveLength(1);
    expect(signedTx.signatures).toHaveLength(1);

    // Signature should be base64 encoded
    const sigBytes = Buffer.from(signedTx.signatures[0], 'base64');
    expect(sigBytes).toHaveLength(64); // compact signature

    // Should be deterministic
    const signedTx2 = signTx(key, [msg], {
      accountNumber: '42',
      sequence: '7',
      gasLimit: 200000,
      feeAmount: '20000000000000000',
    });
    expect(signedTx.signatures[0]).toBe(signedTx2.signatures[0]);
  });

  it('should produce different signatures for different sequences', () => {
    const key = RepublicKey.fromPrivateKey(TEST_PRIVATE_KEY);
    const msg = msgSend(key.getAddress(), 'rai1receiver', [
      { denom: 'arai', amount: '1000000' },
    ]);

    const tx1 = signTx(key, [msg], {
      accountNumber: '42',
      sequence: '7',
    });
    const tx2 = signTx(key, [msg], {
      accountNumber: '42',
      sequence: '8',
    });

    expect(tx1.signatures[0]).not.toBe(tx2.signatures[0]);
  });
});

describe('Transaction encoding', () => {
  it('should encode to base64', () => {
    const key = RepublicKey.fromPrivateKey(TEST_PRIVATE_KEY);
    const msg = msgSend(key.getAddress(), 'rai1receiver', [
      { denom: 'arai', amount: '100' },
    ]);

    const signedTx = signTx(key, [msg], {
      accountNumber: '0',
      sequence: '0',
    });

    const encoded = encodeTx(signedTx);

    // Should be valid base64
    const decoded = Buffer.from(encoded, 'base64').toString();
    const parsed = JSON.parse(decoded);

    expect(parsed.body).toBeDefined();
    expect(parsed.auth_info).toBeDefined();
    expect(parsed.signatures).toBeDefined();
  });
});
