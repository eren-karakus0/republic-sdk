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
  WITHDRAW_REWARD: '/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward',
  VOTE: '/cosmos.gov.v1beta1.MsgVote',
  SUBMIT_JOB: '/republic.computevalidation.v1.MsgSubmitJob',
} as const;

export const QUERY_PATHS = {
  ACCOUNT: '/cosmos.auth.v1beta1.Query/Account',
  BALANCE: '/cosmos.bank.v1beta1.Query/AllBalances',
  VALIDATORS: '/cosmos.staking.v1beta1.Query/Validators',
  VALIDATOR: '/cosmos.staking.v1beta1.Query/Validator',
  DELEGATIONS: '/cosmos.staking.v1beta1.Query/DelegatorDelegations',
  DELEGATION: '/cosmos.staking.v1beta1.Query/Delegation',
  REWARDS: '/cosmos.distribution.v1beta1.Query/DelegationTotalRewards',
  REWARD: '/cosmos.distribution.v1beta1.Query/DelegationRewards',
  PROPOSALS: '/cosmos.gov.v1beta1.Query/Proposals',
  PROPOSAL: '/cosmos.gov.v1beta1.Query/Proposal',
  JOB: '/republic.computevalidation.v1.Query/Job',
} as const;

export const PUBKEY_TYPE = '/cosmos.evm.crypto.v1.ethsecp256k1.PubKey';

export const DEFAULT_GAS_LIMIT = 200000;
export const DEFAULT_FEE_AMOUNT = '20000000000000000';
