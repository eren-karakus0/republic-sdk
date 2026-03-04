export interface ChainConfig {
  chainId: string;
  evmChainId: number;
  addressPrefix: string;
  validatorPrefix: string;
  denom: string;
  rpc: string;
  rest: string;
  evmRpc: string;
  grpc: string;
}

export interface AccountInfo {
  address: string;
  accountNumber: string;
  sequence: string;
}

export interface Coin {
  denom: string;
  amount: string;
}

export interface Fee {
  amount: Coin[];
  gasLimit: string;
  payer?: string;
  granter?: string;
}

export interface BroadcastResult {
  hash: string;
  code: number;
  log: string;
  codespace?: string;
}

export interface TxResponse {
  hash: string;
  height: string;
  code: number;
  rawLog: string;
  gasWanted: string;
  gasUsed: string;
  events: TxEvent[];
}

export interface TxEvent {
  type: string;
  attributes: { key: string; value: string }[];
}

export interface NodeStatus {
  nodeInfo: {
    network: string;
    moniker: string;
    version: string;
  };
  syncInfo: {
    latestBlockHeight: string;
    latestBlockTime: string;
    catchingUp: boolean;
  };
}

// Message types

export interface TxMessage {
  '@type': string;
  [key: string]: unknown;
}

export interface MsgSend extends TxMessage {
  '@type': '/cosmos.bank.v1beta1.MsgSend';
  from_address: string;
  to_address: string;
  amount: Coin[];
}

export interface MsgDelegate extends TxMessage {
  '@type': '/cosmos.staking.v1beta1.MsgDelegate';
  delegator_address: string;
  validator_address: string;
  amount: Coin;
}

export interface MsgUndelegate extends TxMessage {
  '@type': '/cosmos.staking.v1beta1.MsgUndelegate';
  delegator_address: string;
  validator_address: string;
  amount: Coin;
}

export interface MsgBeginRedelegate extends TxMessage {
  '@type': '/cosmos.staking.v1beta1.MsgBeginRedelegate';
  delegator_address: string;
  validator_src_address: string;
  validator_dst_address: string;
  amount: Coin;
}

export interface MsgSubmitJob extends TxMessage {
  '@type': '/republic.computevalidation.v1.MsgSubmitJob';
  creator: string;
  target_validator: string;
  execution_image: string;
  verification_image: string;
  upload_endpoint: string;
  fetch_endpoint: string;
  fee_amount: string;
}

export interface MsgWithdrawDelegatorReward extends TxMessage {
  '@type': '/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward';
  delegator_address: string;
  validator_address: string;
}

export interface MsgVote extends TxMessage {
  '@type': '/cosmos.gov.v1beta1.MsgVote';
  proposal_id: string;
  voter: string;
  option: number;
}

// Staking & governance query types

export interface Validator {
  operatorAddress: string;
  moniker: string;
  status: string;
  tokens: string;
  commission: string;
  jailed: boolean;
}

export interface Delegation {
  delegatorAddress: string;
  validatorAddress: string;
  shares: string;
  balance: Coin;
}

export interface Reward {
  validatorAddress: string;
  reward: Coin[];
}

export interface Proposal {
  proposalId: string;
  title: string;
  status: string;
  votingEndTime: string;
}

// Job types

export interface JobSubmitParams {
  targetValidator: string;
  executionImage: string;
  verificationImage: string;
  uploadEndpoint: string;
  fetchEndpoint: string;
  feeAmount: string;
  gasLimit?: number;
  fees?: string;
  memo?: string;
}

export interface JobStatus {
  jobId: string;
  status: string;
  creator: string;
  targetValidator: string;
  executionImage: string;
  result?: string;
}

// Key types

export interface KeyInfo {
  name: string;
  address: string;
  publicKey: string;
}

/** @deprecated Use KeyStoreV2 for encrypted storage. This type is kept for migration compatibility. */
export interface LegacyKeyStore {
  [name: string]: {
    privateKey: string;
    address: string;
    publicKey: string;
  };
}

/** Alias for backward compatibility */
export type KeyStore = LegacyKeyStore;

// Encrypted keystore types

export interface ScryptParams {
  n: number;
  r: number;
  p: number;
  dklen: number;
}

export interface EncryptedKey {
  version: 1;
  name: string;
  address: string;
  publicKey: string;
  crypto: {
    cipher: 'aes-256-gcm';
    ciphertext: string;
    cipherparams: {
      iv: string;
      tag: string;
    };
    kdf: 'scrypt';
    kdfparams: ScryptParams & {
      salt: string;
    };
  };
}

export interface KeyStoreV2 {
  version: 2;
  keys: Record<string, EncryptedKey>;
}
