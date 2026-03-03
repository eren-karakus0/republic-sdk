import { describe, it, expect } from 'vitest';
import {
  encodeVarint,
  varintField,
  bytesField,
  stringField,
  concat,
  encodeCoin,
  encodeTxBody,
  encodeAuthInfo,
  encodeSignDoc,
  encodeTxRaw,
  encodeMsgWithdrawDelegatorReward,
  encodeMsgVote,
} from '../src/protobuf';
import { msgSend, msgWithdrawReward, msgVote } from '../src/transaction';
import { PUBKEY_TYPE, MSG_TYPES } from '../src/constants';

describe('Protobuf primitives', () => {
  describe('encodeVarint', () => {
    it('should encode 0', () => {
      expect(encodeVarint(0)).toEqual(new Uint8Array([0]));
    });

    it('should encode small numbers', () => {
      expect(encodeVarint(1)).toEqual(new Uint8Array([1]));
      expect(encodeVarint(127)).toEqual(new Uint8Array([127]));
    });

    it('should encode multi-byte varints', () => {
      // 128 = 0x80 → 0x80, 0x01
      expect(encodeVarint(128)).toEqual(new Uint8Array([0x80, 0x01]));
      // 300 = 0x012c → 0xac, 0x02
      expect(encodeVarint(300)).toEqual(new Uint8Array([0xac, 0x02]));
    });

    it('should encode large numbers (bigint)', () => {
      const bytes = encodeVarint(200000n);
      expect(bytes.length).toBeGreaterThan(1);
    });
  });

  describe('varintField', () => {
    it('should omit zero values (proto3 default)', () => {
      expect(varintField(1, 0)).toEqual(new Uint8Array(0));
    });

    it('should encode non-zero values with field tag', () => {
      const result = varintField(1, 1);
      // field 1, wire type 0 → tag = 0x08, value = 0x01
      expect(result).toEqual(new Uint8Array([0x08, 0x01]));
    });
  });

  describe('stringField', () => {
    it('should omit empty strings', () => {
      expect(stringField(1, '')).toEqual(new Uint8Array(0));
    });

    it('should encode non-empty strings', () => {
      const result = stringField(1, 'arai');
      // tag (0x0a) + length (4) + "arai"
      expect(result[0]).toBe(0x0a); // field 1, wire type 2
      expect(result[1]).toBe(4);    // length
      expect(Buffer.from(result.slice(2)).toString()).toBe('arai');
    });
  });

  describe('bytesField', () => {
    it('should omit empty bytes', () => {
      expect(bytesField(1, new Uint8Array(0))).toEqual(new Uint8Array(0));
    });

    it('should encode non-empty bytes', () => {
      const data = new Uint8Array([0xde, 0xad]);
      const result = bytesField(1, data);
      expect(result[0]).toBe(0x0a); // field 1, wire type 2
      expect(result[1]).toBe(2);    // length
      expect(result[2]).toBe(0xde);
      expect(result[3]).toBe(0xad);
    });
  });

  describe('concat', () => {
    it('should concatenate arrays', () => {
      const result = concat(
        new Uint8Array([1, 2]),
        new Uint8Array([3, 4]),
      );
      expect(result).toEqual(new Uint8Array([1, 2, 3, 4]));
    });

    it('should handle empty arrays', () => {
      const result = concat(new Uint8Array(0), new Uint8Array([1]));
      expect(result).toEqual(new Uint8Array([1]));
    });
  });
});

describe('Protobuf message encoding', () => {
  describe('encodeCoin', () => {
    it('should encode a Coin message', () => {
      const result = encodeCoin({ denom: 'arai', amount: '100' });
      // Should contain both denom and amount as string fields
      expect(result.length).toBeGreaterThan(0);
      // First field: denom string
      expect(result[0]).toBe(0x0a); // field 1, wire type 2
    });
  });

  describe('encodeTxBody', () => {
    it('should encode a TxBody with MsgSend', () => {
      const msg = msgSend('rai1sender', 'rai1receiver', [
        { denom: 'arai', amount: '100' },
      ]);
      const result = encodeTxBody([msg]);

      expect(result.length).toBeGreaterThan(0);
      // First field should be a message field (field 1, wire type 2)
      expect(result[0]).toBe(0x0a);
    });

    it('should include memo when provided', () => {
      const msg = msgSend('rai1a', 'rai1b', [{ denom: 'arai', amount: '1' }]);
      const withMemo = encodeTxBody([msg], 'test memo');
      const withoutMemo = encodeTxBody([msg]);

      expect(withMemo.length).toBeGreaterThan(withoutMemo.length);
    });
  });

  describe('Fee encoding', () => {
    it('should encode gas_limit as field 2 (not field 3)', () => {
      // Build a minimal AuthInfo to inspect Fee encoding
      const pubKey = new Uint8Array(33).fill(0x02);
      const fee = {
        amount: [{ denom: 'arai', amount: '20000000000000000' }],
        gasLimit: '200000',
      };

      const result = encodeAuthInfo(PUBKEY_TYPE, pubKey, 0n, fee);
      expect(result.length).toBeGreaterThan(0);

      // The Fee sub-message is at field 2 of AuthInfo.
      // Inside Fee, gas_limit should be field 2 (tag = 0x10, varint).
      // Field 3 would be tag = 0x18. We must NOT find 0x18 followed by
      // the gas_limit varint in the fee section.
      const bytes = Buffer.from(result);
      const hex = bytes.toString('hex');
      // gas_limit 200000 = varint c09a0c
      // field 2 tag = 10, field 3 tag = 18
      // We should find "10c09a0c" (field 2) not "18c09a0c" (field 3)
      expect(hex).toContain('10c09a0c');
      expect(hex).not.toContain('18c09a0c');
    });
  });

  describe('encodeAuthInfo', () => {
    it('should encode auth info with pubkey and fee', () => {
      const pubKey = new Uint8Array(33).fill(0x02);
      const fee = {
        amount: [{ denom: 'arai', amount: '20000000000000000' }],
        gasLimit: '200000',
      };

      const result = encodeAuthInfo(PUBKEY_TYPE, pubKey, 0n, fee);
      expect(result.length).toBeGreaterThan(0);
      // First field: signer_infos (field 1, wire type 2)
      expect(result[0]).toBe(0x0a);
    });
  });

  describe('encodeSignDoc', () => {
    it('should encode a SignDoc', () => {
      const body = new Uint8Array([1, 2, 3]);
      const authInfo = new Uint8Array([4, 5, 6]);

      const result = encodeSignDoc(body, authInfo, 'raitestnet_77701-1', 42n);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('encodeTxRaw', () => {
    it('should encode a TxRaw', () => {
      const body = new Uint8Array([1, 2, 3]);
      const authInfo = new Uint8Array([4, 5, 6]);
      const sig = new Uint8Array(64).fill(0xff);

      const result = encodeTxRaw(body, authInfo, sig);
      expect(result.length).toBeGreaterThan(0);
      // Should start with field 1 (body_bytes)
      expect(result[0]).toBe(0x0a);
    });
  });

  describe('encodeMsgWithdrawDelegatorReward', () => {
    it('should encode withdraw reward message', () => {
      const msg = msgWithdrawReward('rai1delegator', 'raivaloper1validator');
      const result = encodeMsgWithdrawDelegatorReward(msg);

      expect(result.length).toBeGreaterThan(0);
      // field 1 = delegator_address (string, tag = 0x0a)
      expect(result[0]).toBe(0x0a);

      // Should contain both addresses
      const decoded = Buffer.from(result).toString();
      expect(decoded).toContain('rai1delegator');
      expect(decoded).toContain('raivaloper1validator');
    });

    it('should encode in TxBody via encodeMessage', () => {
      const msg = msgWithdrawReward('rai1del', 'raivaloper1val');
      const body = encodeTxBody([msg]);
      expect(body.length).toBeGreaterThan(0);
      expect(body[0]).toBe(0x0a);
    });
  });

  describe('encodeMsgVote', () => {
    it('should encode vote message', () => {
      const msg = msgVote('1', 'rai1voter', 1);
      const result = encodeMsgVote(msg);

      expect(result.length).toBeGreaterThan(0);
      // field 1 = proposal_id (varint, tag = 0x08)
      expect(result[0]).toBe(0x08);
    });

    it('should encode different vote options', () => {
      const msgYes = msgVote('1', 'rai1voter', 1);
      const msgNo = msgVote('1', 'rai1voter', 3);

      const resultYes = encodeMsgVote(msgYes);
      const resultNo = encodeMsgVote(msgNo);

      // Different vote options should produce different encodings
      expect(Buffer.from(resultYes).toString('hex')).not.toBe(
        Buffer.from(resultNo).toString('hex'),
      );
    });

    it('should encode in TxBody via encodeMessage', () => {
      const msg = msgVote('5', 'rai1voter', 2);
      const body = encodeTxBody([msg]);
      expect(body.length).toBeGreaterThan(0);
      expect(body[0]).toBe(0x0a);
    });
  });
});
