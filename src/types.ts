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

export interface TxBody {
  messages: TxMessage[];
  memo: string;
  timeoutHeight: string;
  extensionOptions: unknown[];
  nonCriticalExtensionOptions: unknown[];
}

export interface SignerInfo {
  publicKey: {
    '@type': string;
    key: string;
  };
  modeInfo: {
    single: {
      mode: string;
    };
  };
  sequence: string;
}

export interface AuthInfo {
  signerInfos: SignerInfo[];
  fee: Fee;
}

export interface SignedTx {
  body: TxBody;
  auth_info: AuthInfo;
  signatures: string[];
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

// Job types

export interface JobSubmitParams {
  from: string;
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

export interface KeyStore {
  [name: string]: {
    privateKey: string;
    address: string;
    publicKey: string;
  };
}
