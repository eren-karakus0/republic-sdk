export const REPUBLIC_TESTNET = {
  chainId: 'raitestnet_77701-1',
  evmChainId: 77701,
  addressPrefix: 'rai',
  validatorPrefix: 'raivaloper',
  denom: 'arai',
  rpc: 'https://rpc.republicai.io',
  rest: 'https://rest.republicai.io',
  evmRpc: 'https://evm-rpc.republicai.io',
  grpc: 'grpc.republicai.io:443',
} as const;

export const MSG_TYPES = {
  SEND: '/cosmos.bank.v1beta1.MsgSend',
  DELEGATE: '/cosmos.staking.v1beta1.MsgDelegate',
  UNDELEGATE: '/cosmos.staking.v1beta1.MsgUndelegate',
  REDELEGATE: '/cosmos.staking.v1beta1.MsgBeginRedelegate',
  SUBMIT_JOB: '/republic.computevalidation.v1.MsgSubmitJob',
} as const;

export const QUERY_PATHS = {
  ACCOUNT: '/cosmos.auth.v1beta1.Query/Account',
  BALANCE: '/cosmos.bank.v1beta1.Query/AllBalances',
  JOB: '/republic.computevalidation.v1.Query/Job',
} as const;

export const DEFAULT_GAS_LIMIT = 200000;
export const DEFAULT_FEE_AMOUNT = '20000000000000000';
