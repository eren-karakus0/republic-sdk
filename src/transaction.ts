import { RepublicKey } from './key.js';
import { REPUBLIC_TESTNET, DEFAULT_GAS_LIMIT, DEFAULT_FEE_AMOUNT, MSG_TYPES, PUBKEY_TYPE } from './constants.js';
import {
  encodeTxBody,
  encodeAuthInfo,
  encodeSignDoc,
  encodeTxRaw,
} from './protobuf.js';
import type {
  Coin,
  Fee,
  MsgSend,
  MsgDelegate,
  MsgUndelegate,
  MsgBeginRedelegate,
  MsgSubmitJob,
  TxMessage,
} from './types.js';

export interface TxOptions {
  chainId?: string;
  accountNumber: string;
  sequence: string;
  gasLimit?: number;
  feeAmount?: string;
  feeDenom?: string;
  memo?: string;
}

/** Build fee object */
export function buildFee(
  gasLimit = DEFAULT_GAS_LIMIT,
  amount: string = DEFAULT_FEE_AMOUNT,
  denom: string = REPUBLIC_TESTNET.denom,
): Fee {
  return {
    amount: [{ denom, amount }],
    gasLimit: String(gasLimit),
    payer: '',
    granter: '',
  };
}

/**
 * Sign a transaction using protobuf-encoded SIGN_MODE_DIRECT.
 *
 * Flow:
 *   1. Encode TxBody → bodyBytes (protobuf)
 *   2. Encode AuthInfo → authInfoBytes (protobuf)
 *   3. Encode SignDoc(bodyBytes, authInfoBytes, chainId, accountNumber) → protobuf
 *   4. SHA256 + secp256k1 sign the SignDoc bytes
 *   5. Return TxRaw(bodyBytes, authInfoBytes, signature) as base64
 */
export function signTx(
  key: RepublicKey,
  messages: TxMessage[],
  options: TxOptions,
): string {
  const {
    chainId = REPUBLIC_TESTNET.chainId,
    accountNumber,
    sequence,
    gasLimit = DEFAULT_GAS_LIMIT,
    feeAmount = DEFAULT_FEE_AMOUNT,
    feeDenom = REPUBLIC_TESTNET.denom,
    memo = '',
  } = options;

  const fee = buildFee(gasLimit, feeAmount, feeDenom);

  // 1. Encode TxBody
  const bodyBytes = encodeTxBody(messages, memo);

  // 2. Encode AuthInfo
  const authInfoBytes = encodeAuthInfo(
    PUBKEY_TYPE,
    key.compressedPublicKey,
    BigInt(sequence),
    fee,
  );

  // 3. Encode SignDoc and sign
  const signDocBytes = encodeSignDoc(
    bodyBytes,
    authInfoBytes,
    chainId,
    BigInt(accountNumber),
  );
  const signature = key.sign(signDocBytes);

  // 4. Encode TxRaw
  const txRaw = encodeTxRaw(bodyBytes, authInfoBytes, signature);

  // 5. Return base64 for broadcasting
  return Buffer.from(txRaw).toString('base64');
}

// ─── Message Builders ─────────────────────────────────────────────────────────

export function msgSend(
  fromAddress: string,
  toAddress: string,
  amount: Coin[],
): MsgSend {
  return {
    '@type': MSG_TYPES.SEND,
    from_address: fromAddress,
    to_address: toAddress,
    amount,
  };
}

export function msgDelegate(
  delegatorAddress: string,
  validatorAddress: string,
  amount: Coin,
): MsgDelegate {
  return {
    '@type': MSG_TYPES.DELEGATE,
    delegator_address: delegatorAddress,
    validator_address: validatorAddress,
    amount,
  };
}

export function msgUndelegate(
  delegatorAddress: string,
  validatorAddress: string,
  amount: Coin,
): MsgUndelegate {
  return {
    '@type': MSG_TYPES.UNDELEGATE,
    delegator_address: delegatorAddress,
    validator_address: validatorAddress,
    amount,
  };
}

export function msgRedelegate(
  delegatorAddress: string,
  srcValidatorAddress: string,
  dstValidatorAddress: string,
  amount: Coin,
): MsgBeginRedelegate {
  return {
    '@type': MSG_TYPES.REDELEGATE,
    delegator_address: delegatorAddress,
    validator_src_address: srcValidatorAddress,
    validator_dst_address: dstValidatorAddress,
    amount,
  };
}

export function msgSubmitJob(params: {
  creator: string;
  targetValidator: string;
  executionImage: string;
  verificationImage: string;
  uploadEndpoint: string;
  fetchEndpoint: string;
  feeAmount: string;
}): MsgSubmitJob {
  return {
    '@type': MSG_TYPES.SUBMIT_JOB,
    creator: params.creator,
    target_validator: params.targetValidator,
    execution_image: params.executionImage,
    verification_image: params.verificationImage,
    upload_endpoint: params.uploadEndpoint,
    fetch_endpoint: params.fetchEndpoint,
    fee_amount: params.feeAmount,
  };
}
