import axios, { AxiosInstance } from 'axios';
import { REPUBLIC_TESTNET } from './constants.js';
import { sleep, retry } from './utils.js';
import type { RetryOptions } from './utils.js';
import { RpcError, BroadcastError, TimeoutError, AccountNotFoundError } from './errors.js';
import type {
  AccountInfo,
  BroadcastResult,
  ChainConfig,
  Coin,
  Delegation,
  NodeStatus,
  Proposal,
  Reward,
  TxResponse,
  Validator,
} from './types.js';

export interface ClientOptions {
  retryOptions?: Partial<RetryOptions>;
}

export class RepublicClient {
  private rpc: AxiosInstance;
  private rest: AxiosInstance;
  readonly config: ChainConfig;
  private retryOpts: Partial<RetryOptions>;

  constructor(config?: Partial<ChainConfig>, options?: ClientOptions) {
    this.config = { ...REPUBLIC_TESTNET, ...config };
    this.retryOpts = options?.retryOptions ?? {};

    this.rpc = axios.create({
      baseURL: this.config.rpc,
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.rest = axios.create({
      baseURL: this.config.rest,
      timeout: 15000,
    });
  }

  /** Tendermint JSON-RPC call with retry */
  private async rpcCall<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    return retry(async () => {
      const { data } = await this.rpc.post('', {
        jsonrpc: '2.0',
        id: 1,
        method,
        params,
      });

      if (data.error) {
        throw new RpcError(
          `RPC Error: ${JSON.stringify(data.error)}`,
          data.error.code ?? -1,
          this.config.rpc,
        );
      }

      return data.result as T;
    }, this.retryOpts);
  }

  /** REST GET call with retry */
  private async restGet<T = unknown>(path: string): Promise<T> {
    return retry(async () => {
      const { data } = await this.rest.get(path);
      return data as T;
    }, this.retryOpts);
  }

  /** Query node status */
  async getStatus(): Promise<NodeStatus> {
    const result = await this.rpcCall<{
      node_info: {
        network: string;
        moniker: string;
        version: string;
      };
      sync_info: {
        latest_block_height: string;
        latest_block_time: string;
        catching_up: boolean;
      };
    }>('status');

    return {
      nodeInfo: {
        network: result.node_info.network,
        moniker: result.node_info.moniker,
        version: result.node_info.version,
      },
      syncInfo: {
        latestBlockHeight: result.sync_info.latest_block_height,
        latestBlockTime: result.sync_info.latest_block_time,
        catchingUp: result.sync_info.catching_up,
      },
    };
  }

  /** Get account info (account_number, sequence) via REST API */
  async getAccountInfo(address: string): Promise<AccountInfo> {
    try {
      const data = await this.restGet<{
        account?: {
          base_account?: { address: string; account_number: string; sequence: string };
          address?: string;
          account_number?: string;
          sequence?: string;
        };
        base_account?: { address: string; account_number: string; sequence: string };
        address?: string;
        account_number?: string;
        sequence?: string;
      }>(`/cosmos/auth/v1beta1/accounts/${address}`);

      const account = data.account || data;
      const baseAccount = (account as Record<string, unknown>).base_account || account;
      const ba = baseAccount as Record<string, string>;

      return {
        address: ba.address || address,
        accountNumber: ba.account_number || '0',
        sequence: ba.sequence || '0',
      };
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        throw new AccountNotFoundError(address);
      }
      throw err;
    }
  }

  /** Get account info, returning defaults for non-existent accounts */
  async getAccountInfoSafe(address: string): Promise<AccountInfo> {
    try {
      return await this.getAccountInfo(address);
    } catch (err) {
      if (err instanceof AccountNotFoundError) {
        return { address, accountNumber: '0', sequence: '0' };
      }
      throw err;
    }
  }

  /** Get account balances */
  async getBalances(address: string): Promise<Coin[]> {
    const data = await this.restGet<{ balances?: Coin[] }>(
      `/cosmos/bank/v1beta1/balances/${address}`,
    );
    return (data.balances || []) as Coin[];
  }

  /** Get specific denom balance */
  async getBalance(address: string, denom?: string): Promise<Coin> {
    const d = denom || this.config.denom;
    try {
      const data = await this.restGet<{ balance?: Coin }>(
        `/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=${d}`,
      );
      return (data.balance || { denom: d, amount: '0' }) as Coin;
    } catch {
      return { denom: d, amount: '0' };
    }
  }

  /** Broadcast a signed transaction (base64-encoded tx bytes) */
  async broadcastTx(
    txBytes: string,
    mode: 'sync' | 'async' | 'commit' = 'sync',
  ): Promise<BroadcastResult> {
    const methodMap = {
      sync: 'broadcast_tx_sync',
      async: 'broadcast_tx_async',
      commit: 'broadcast_tx_commit',
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await this.rpcCall<any>(methodMap[mode], { tx: txBytes });

    if (mode === 'commit') {
      const checkCode = raw.check_tx?.code ?? 0;
      const deliverCode = raw.deliver_tx?.code ?? 0;
      const code = checkCode !== 0 ? checkCode : deliverCode;
      const log = checkCode !== 0
        ? (raw.check_tx?.log ?? '')
        : (raw.deliver_tx?.log ?? '');

      if (code !== 0) {
        throw new BroadcastError(
          `Broadcast failed (code ${code}): ${log}`,
          code, log, raw.hash,
        );
      }

      return { hash: raw.hash ?? '', code: 0, log };
    }

    const code = raw.code ?? 0;
    const log = raw.log ?? '';
    if (code !== 0) {
      throw new BroadcastError(
        `Broadcast failed (code ${code}): ${log}`,
        code, log, raw.hash,
      );
    }

    return {
      hash: raw.hash ?? '',
      code,
      log,
      codespace: raw.codespace,
    };
  }

  /** Query a transaction by hash */
  async getTx(hash: string): Promise<TxResponse | null> {
    try {
      const result = await this.rpcCall<{
        hash: string;
        height: string;
        tx_result: {
          code: number;
          log: string;
          gas_wanted: string;
          gas_used: string;
          events: { type: string; attributes: { key: string; value: string }[] }[];
        };
      }>('tx', { hash: `0x${hash}` });

      return {
        hash: result.hash,
        height: result.height,
        code: result.tx_result.code,
        rawLog: result.tx_result.log,
        gasWanted: result.tx_result.gas_wanted,
        gasUsed: result.tx_result.gas_used,
        events: result.tx_result.events,
      };
    } catch {
      return null;
    }
  }

  /** Wait for a transaction to be included in a block */
  async waitForTx(
    hash: string,
    timeoutMs = 30000,
    pollIntervalMs = 2000,
  ): Promise<TxResponse> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const tx = await this.getTx(hash);
      if (tx) return tx;
      await sleep(pollIntervalMs);
    }

    throw new TimeoutError(`Timeout waiting for tx ${hash}`);
  }

  /** ABCI query */
  async abciQuery(
    path: string,
    data?: string,
  ): Promise<{ value: string; height: string }> {
    const result = await this.rpcCall<{
      response: { value: string; height: string; code: number; log: string };
    }>('abci_query', {
      path,
      data: data || '',
    });

    if (result.response.code !== 0) {
      throw new RpcError(
        `ABCI query failed: ${result.response.log}`,
        result.response.code,
        this.config.rpc,
      );
    }

    return {
      value: result.response.value,
      height: result.response.height,
    };
  }

  /** Broadcast via REST API (alternative method) */
  async broadcastTxRest(
    txBytes: string,
    mode: 'BROADCAST_MODE_SYNC' | 'BROADCAST_MODE_ASYNC' | 'BROADCAST_MODE_BLOCK' = 'BROADCAST_MODE_SYNC',
  ): Promise<BroadcastResult> {
    const { data } = await this.rest.post('/cosmos/tx/v1beta1/txs', {
      tx_bytes: txBytes,
      mode,
    });

    const txResponse = data.tx_response;

    if (txResponse.code !== 0) {
      throw new BroadcastError(
        `Broadcast failed (code ${txResponse.code}): ${txResponse.raw_log}`,
        txResponse.code,
        txResponse.raw_log || '',
        txResponse.txhash,
      );
    }

    return {
      hash: txResponse.txhash,
      code: txResponse.code,
      log: txResponse.raw_log || '',
    };
  }

  // ─── Staking Queries ─────────────────────────────────────────────────────────

  /** Get validator list */
  async getValidators(
    status?: 'BOND_STATUS_BONDED' | 'BOND_STATUS_UNBONDING' | 'BOND_STATUS_UNBONDED',
  ): Promise<Validator[]> {
    const query = status ? `?status=${status}` : '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await this.restGet<any>(
      `/cosmos/staking/v1beta1/validators${query}`,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.validators || []).map((v: any) => ({
      operatorAddress: v.operator_address,
      moniker: v.description?.moniker || '',
      status: v.status,
      tokens: v.tokens || '0',
      commission: v.commission?.commission_rates?.rate || '0',
      jailed: v.jailed || false,
    })) as Validator[];
  }

  /** Get single validator info */
  async getValidator(validatorAddress: string): Promise<Validator> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await this.restGet<any>(
      `/cosmos/staking/v1beta1/validators/${validatorAddress}`,
    );

    const v = data.validator;
    return {
      operatorAddress: v.operator_address,
      moniker: v.description?.moniker || '',
      status: v.status,
      tokens: v.tokens || '0',
      commission: v.commission?.commission_rates?.rate || '0',
      jailed: v.jailed || false,
    };
  }

  /** Get all delegations for a delegator */
  async getDelegations(delegatorAddress: string): Promise<Delegation[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await this.restGet<any>(
      `/cosmos/staking/v1beta1/delegations/${delegatorAddress}`,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.delegation_responses || []).map((d: any) => ({
      delegatorAddress: d.delegation?.delegator_address,
      validatorAddress: d.delegation?.validator_address,
      shares: d.delegation?.shares || '0',
      balance: d.balance || { denom: this.config.denom, amount: '0' },
    })) as Delegation[];
  }

  /** Get delegation to a specific validator */
  async getDelegation(
    delegatorAddress: string,
    validatorAddress: string,
  ): Promise<Delegation> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await this.restGet<any>(
      `/cosmos/staking/v1beta1/validators/${validatorAddress}/delegations/${delegatorAddress}`,
    );

    const d = data.delegation_response;
    return {
      delegatorAddress: d.delegation?.delegator_address,
      validatorAddress: d.delegation?.validator_address,
      shares: d.delegation?.shares || '0',
      balance: d.balance || { denom: this.config.denom, amount: '0' },
    };
  }

  /** Get all staking rewards for a delegator */
  async getRewards(delegatorAddress: string): Promise<Reward[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await this.restGet<any>(
      `/cosmos/distribution/v1beta1/delegators/${delegatorAddress}/rewards`,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.rewards || []).map((r: any) => ({
      validatorAddress: r.validator_address,
      reward: r.reward || [],
    })) as Reward[];
  }

  /** Get staking reward for a specific validator */
  async getReward(
    delegatorAddress: string,
    validatorAddress: string,
  ): Promise<Coin[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await this.restGet<any>(
      `/cosmos/distribution/v1beta1/delegators/${delegatorAddress}/rewards/${validatorAddress}`,
    );

    return (data.rewards || []) as Coin[];
  }

  // ─── Governance Queries ──────────────────────────────────────────────────────

  /** Get governance proposals */
  async getProposals(status?: string): Promise<Proposal[]> {
    const query = status ? `?proposal_status=${status}` : '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await this.restGet<any>(
      `/cosmos/gov/v1beta1/proposals${query}`,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.proposals || []).map((p: any) => ({
      proposalId: p.proposal_id || p.id,
      title: p.content?.title || p.title || '',
      status: p.status,
      votingEndTime: p.voting_end_time || '',
    })) as Proposal[];
  }

  /** Get a specific governance proposal */
  async getProposal(proposalId: string): Promise<Proposal> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await this.restGet<any>(
      `/cosmos/gov/v1beta1/proposals/${proposalId}`,
    );

    const p = data.proposal;
    return {
      proposalId: p.proposal_id || p.id,
      title: p.content?.title || p.title || '',
      status: p.status,
      votingEndTime: p.voting_end_time || '',
    };
  }
}
