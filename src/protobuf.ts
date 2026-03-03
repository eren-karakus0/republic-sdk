/**
 * Minimal protobuf encoder for Cosmos SDK transaction types.
 *
 * Implements just enough wire-format encoding (proto3) to build
 * TxRaw, SignDoc, TxBody, AuthInfo and the standard message types
 * without pulling in a full protobuf dependency.
 *
 * Wire types:
 *   0 = varint, 2 = length-delimited
 *
 * Proto3 default-value omission rules apply:
 *   - varint 0 → omitted
 *   - empty string / bytes → omitted
 */

// ─── Primitives ───────────────────────────────────────────────────────────────

export function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

export function encodeVarint(value: number | bigint): Uint8Array {
  let v = BigInt(value);
  if (v === 0n) return new Uint8Array([0]);
  const bytes: number[] = [];
  while (v > 0x7fn) {
    bytes.push(Number(v & 0x7fn) | 0x80);
    v >>= 7n;
  }
  bytes.push(Number(v));
  return new Uint8Array(bytes);
}

function fieldTag(fieldNumber: number, wireType: number): Uint8Array {
  return encodeVarint((fieldNumber << 3) | wireType);
}

/** Encode a varint field. Omits if value === 0 (proto3 default). */
export function varintField(fieldNumber: number, value: number | bigint): Uint8Array {
  if (BigInt(value) === 0n) return new Uint8Array(0);
  return concat(fieldTag(fieldNumber, 0), encodeVarint(value));
}

/** Encode length-delimited field. Omits if data is empty. */
export function bytesField(fieldNumber: number, data: Uint8Array): Uint8Array {
  if (data.length === 0) return new Uint8Array(0);
  return concat(fieldTag(fieldNumber, 2), encodeVarint(data.length), data);
}

/** Encode a string field. Omits if empty. */
export function stringField(fieldNumber: number, str: string): Uint8Array {
  if (str === '') return new Uint8Array(0);
  const data = new TextEncoder().encode(str);
  return concat(fieldTag(fieldNumber, 2), encodeVarint(data.length), data);
}

/** Wrap already-encoded fields as a sub-message in a length-delimited field. */
export function messageField(fieldNumber: number, ...fields: Uint8Array[]): Uint8Array {
  const inner = concat(...fields);
  if (inner.length === 0) return new Uint8Array(0);
  return bytesField(fieldNumber, inner);
}

/** Encode raw sub-message bytes (no field wrapping, just concatenation). */
export function rawMessage(...fields: Uint8Array[]): Uint8Array {
  return concat(...fields);
}

// ─── Cosmos Primitives ────────────────────────────────────────────────────────

import type { Coin, TxMessage, MsgSend, MsgDelegate, MsgUndelegate, MsgBeginRedelegate, MsgSubmitJob, Fee } from './types.js';
import { MSG_TYPES } from './constants.js';

/** cosmos.base.v1beta1.Coin { string denom = 1; string amount = 2; } */
export function encodeCoin(coin: Coin): Uint8Array {
  return rawMessage(
    stringField(1, coin.denom),
    stringField(2, coin.amount),
  );
}

/** google.protobuf.Any { string type_url = 1; bytes value = 2; } */
export function encodeAny(typeUrl: string, value: Uint8Array): Uint8Array {
  return rawMessage(
    stringField(1, typeUrl),
    bytesField(2, value),
  );
}

// ─── Message Encoders ─────────────────────────────────────────────────────────

/** cosmos.bank.v1beta1.MsgSend */
export function encodeMsgSend(msg: MsgSend): Uint8Array {
  return rawMessage(
    stringField(1, msg.from_address),
    stringField(2, msg.to_address),
    ...msg.amount.map((c) => messageField(3, ...splitCoin(c))),
  );
}

/** cosmos.staking.v1beta1.MsgDelegate */
export function encodeMsgDelegate(msg: MsgDelegate): Uint8Array {
  return rawMessage(
    stringField(1, msg.delegator_address),
    stringField(2, msg.validator_address),
    messageField(3, ...splitCoin(msg.amount)),
  );
}

/** cosmos.staking.v1beta1.MsgUndelegate */
export function encodeMsgUndelegate(msg: MsgUndelegate): Uint8Array {
  return rawMessage(
    stringField(1, msg.delegator_address),
    stringField(2, msg.validator_address),
    messageField(3, ...splitCoin(msg.amount)),
  );
}

/** cosmos.staking.v1beta1.MsgBeginRedelegate */
export function encodeMsgBeginRedelegate(msg: MsgBeginRedelegate): Uint8Array {
  return rawMessage(
    stringField(1, msg.delegator_address),
    stringField(2, msg.validator_src_address),
    stringField(3, msg.validator_dst_address),
    messageField(4, ...splitCoin(msg.amount)),
  );
}

/** republic.computevalidation.v1.MsgSubmitJob (field numbers inferred from JSON key ordering) */
export function encodeMsgSubmitJob(msg: MsgSubmitJob): Uint8Array {
  return rawMessage(
    stringField(1, msg.creator),
    stringField(2, msg.target_validator),
    stringField(3, msg.execution_image),
    stringField(4, msg.upload_endpoint),
    stringField(5, msg.fetch_endpoint),
    stringField(6, msg.verification_image),
    stringField(7, msg.fee_amount),
  );
}

/** Route a TxMessage to the correct encoder */
export function encodeMessage(msg: TxMessage): Uint8Array {
  switch (msg['@type']) {
    case MSG_TYPES.SEND:
      return encodeAny(msg['@type'], encodeMsgSend(msg as MsgSend));
    case MSG_TYPES.DELEGATE:
      return encodeAny(msg['@type'], encodeMsgDelegate(msg as MsgDelegate));
    case MSG_TYPES.UNDELEGATE:
      return encodeAny(msg['@type'], encodeMsgUndelegate(msg as MsgUndelegate));
    case MSG_TYPES.REDELEGATE:
      return encodeAny(msg['@type'], encodeMsgBeginRedelegate(msg as MsgBeginRedelegate));
    case MSG_TYPES.SUBMIT_JOB:
      return encodeAny(msg['@type'], encodeMsgSubmitJob(msg as MsgSubmitJob));
    default:
      throw new Error(`Unknown message type: ${msg['@type']}`);
  }
}

// ─── Transaction Structures ───────────────────────────────────────────────────

/**
 * cosmos.tx.v1beta1.TxBody
 *   repeated Any messages = 1;
 *   string memo = 2;
 *   uint64 timeout_height = 3;
 */
export function encodeTxBody(messages: TxMessage[], memo = ''): Uint8Array {
  return rawMessage(
    ...messages.map((m) => bytesField(1, encodeMessage(m))),
    stringField(2, memo),
    // timeout_height omitted (0 = default)
  );
}

/**
 * cosmos.tx.v1beta1.AuthInfo
 *   repeated SignerInfo signer_infos = 1;
 *   Fee fee = 2;
 *
 * SignerInfo:
 *   Any public_key = 1;
 *   ModeInfo mode_info = 2;
 *   uint64 sequence = 3;
 *
 * ModeInfo.Single:
 *   SignMode mode = 1;  (SIGN_MODE_DIRECT = 1)
 *
 * PubKey: bytes key = 1;
 */
export function encodeAuthInfo(
  pubKeyTypeUrl: string,
  compressedPubKey: Uint8Array,
  sequence: number | bigint,
  fee: Fee,
): Uint8Array {
  // PubKey { bytes key = 1 }
  const pubKeyValue = rawMessage(bytesField(1, compressedPubKey));

  // Any { type_url = 1, value = 2 }
  const pubKeyAny = rawMessage(
    stringField(1, pubKeyTypeUrl),
    bytesField(2, pubKeyValue),
  );

  // ModeInfo.Single { mode = 1 (SIGN_MODE_DIRECT) }
  const modeInfoSingle = rawMessage(varintField(1, 1));
  // ModeInfo { single = 1 }
  const modeInfo = rawMessage(messageField(1, modeInfoSingle));

  // SignerInfo { public_key = 1, mode_info = 2, sequence = 3 }
  const signerInfo = rawMessage(
    messageField(1, pubKeyAny),
    messageField(2, modeInfo),
    varintField(3, sequence),
  );

  // Fee { repeated Coin amount = 1, uint64 gas_limit = 3 }
  // Note: field 2 is "string gas" (deprecated), field 3 is gas_limit
  const feeEncoded = rawMessage(
    ...fee.amount.map((c) => messageField(1, ...splitCoin(c))),
    varintField(3, BigInt(fee.gasLimit)),
  );

  return rawMessage(
    messageField(1, signerInfo),
    messageField(2, feeEncoded),
  );
}

/**
 * cosmos.tx.v1beta1.SignDoc
 *   bytes body_bytes = 1;
 *   bytes auth_info_bytes = 2;
 *   string chain_id = 3;
 *   uint64 account_number = 4;
 */
export function encodeSignDoc(
  bodyBytes: Uint8Array,
  authInfoBytes: Uint8Array,
  chainId: string,
  accountNumber: number | bigint,
): Uint8Array {
  return rawMessage(
    bytesField(1, bodyBytes),
    bytesField(2, authInfoBytes),
    stringField(3, chainId),
    varintField(4, accountNumber),
  );
}

/**
 * cosmos.tx.v1beta1.TxRaw
 *   bytes body_bytes = 1;
 *   bytes auth_info_bytes = 2;
 *   repeated bytes signatures = 3;
 */
export function encodeTxRaw(
  bodyBytes: Uint8Array,
  authInfoBytes: Uint8Array,
  signature: Uint8Array,
): Uint8Array {
  return rawMessage(
    bytesField(1, bodyBytes),
    bytesField(2, authInfoBytes),
    bytesField(3, signature),
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Split Coin into its protobuf fields (for use with messageField) */
function splitCoin(coin: Coin): Uint8Array[] {
  return [stringField(1, coin.denom), stringField(2, coin.amount)];
}
