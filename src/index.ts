// Core classes
export { RepublicKey, hexToBytes, bytesToHex, addressToBytes, bytesToAddress } from './key.js';
export { RepublicClient } from './client.js';
export { JobManager } from './job.js';

// Transaction builders
export {
  signTx,
  buildFee,
  msgSend,
  msgDelegate,
  msgUndelegate,
  msgRedelegate,
  msgSubmitJob,
} from './transaction.js';
export type { TxOptions } from './transaction.js';

// Protobuf encoding (advanced usage)
export {
  encodeTxBody,
  encodeAuthInfo,
  encodeSignDoc,
  encodeTxRaw,
  encodeCoin,
  encodeAny,
  encodeMessage,
} from './protobuf.js';

// Constants
export { REPUBLIC_TESTNET, MSG_TYPES, QUERY_PATHS, PUBKEY_TYPE, DEFAULT_GAS_LIMIT, DEFAULT_FEE_AMOUNT } from './constants.js';

// Types
export type {
  ChainConfig,
  AccountInfo,
  Coin,
  Fee,
  BroadcastResult,
  TxResponse,
  TxEvent,
  NodeStatus,
  TxMessage,
  MsgSend,
  MsgDelegate,
  MsgUndelegate,
  MsgBeginRedelegate,
  MsgSubmitJob,
  JobSubmitParams,
  JobStatus,
  KeyInfo,
  KeyStore,
} from './types.js';
