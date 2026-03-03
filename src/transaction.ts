import { RepublicKey } from './key.js';
import { REPUBLIC_TESTNET, DEFAULT_GAS_LIMIT, DEFAULT_FEE_AMOUNT, MSG_TYPES } from './constants.js';
import type {
  AuthInfo,
  Coin,
  Fee,
  MsgSend,
  MsgDelegate,
  MsgUndelegate,
  MsgBeginRedelegate,
  MsgSubmitJob,
  SignedTx,
  TxBody,
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

/** Build a Cosmos SDK transaction body */
export function buildTxBody(
  messages: TxMessage[],
  memo = '',
): TxBody {
  return {
    messages,
    memo,
    timeoutHeight: '0',
    extensionOptions: [],
    nonCriticalExtensionOptions: [],
  };
}

/** Build auth info with signer and fee */
export function buildAuthInfo(
  publicKeyBase64: string,
  sequence: string,
  fee: Fee,
): AuthInfo {
  return {
    signerInfos: [
      {
        publicKey: {
          '@type': '/cosmos.crypto.secp256k1.PubKey',
          key: publicKeyBase64,
        },
        modeInfo: {
          single: {
            mode: 'SIGN_MODE_DIRECT',
          },
        },
        sequence,
      },
    ],
    fee,
  };
}

/** Create fee object */
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
 * Create a SignDoc JSON for signing.
 * This follows the Cosmos SDK SIGN_MODE_DIRECT approach using JSON encoding
 * (compatible with the Python SDK).
 */
export function createSignDoc(
  txBody: TxBody,
  authInfo: AuthInfo,
  chainId: string,
  accountNumber: string,
): Record<string, unknown> {
  return {
    body: txBody,
    auth_info: authInfo,
    chain_id: chainId,
    account_number: accountNumber,
  };
}

/**
 * Sign a transaction.
 * 1. Create SignDoc JSON
 * 2. SHA256 hash it
 * 3. Sign with secp256k1
 */
export function signTx(
  key: RepublicKey,
  messages: TxMessage[],
  options: TxOptions,
): SignedTx {
  const {
    chainId = REPUBLIC_TESTNET.chainId,
    accountNumber,
    sequence,
    gasLimit = DEFAULT_GAS_LIMIT,
    feeAmount = DEFAULT_FEE_AMOUNT,
    feeDenom = REPUBLIC_TESTNET.denom,
    memo = '',
  } = options;

  const txBody = buildTxBody(messages, memo);
  const fee = buildFee(gasLimit, feeAmount, feeDenom);
  const authInfo = buildAuthInfo(key.publicKeyBase64, sequence, fee);

  // Create sign doc and sign it
  const signDoc = createSignDoc(txBody, authInfo, chainId, accountNumber);
  const signDocBytes = new TextEncoder().encode(
    JSON.stringify(sortObjectKeys(signDoc)),
  );
  const signature = key.sign(signDocBytes);
  const signatureBase64 = Buffer.from(signature).toString('base64');

  return {
    body: txBody,
    auth_info: authInfo,
    signatures: [signatureBase64],
  };
}

/** Encode a signed transaction to base64 for broadcasting */
export function encodeTx(signedTx: SignedTx): string {
  const txJson = JSON.stringify(signedTx);
  return Buffer.from(txJson).toString('base64');
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Sort object keys recursively for deterministic JSON serialization */
function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}
