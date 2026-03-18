import axios, { AxiosInstance } from 'axios';
import { REPUBLIC_TESTNET } from './constants.js';
import { sleep, retry } from './utils.js';
import type { RetryOptions } from './utils.js';
import { RpcError, BroadcastError, TimeoutError, AccountNotFoundError, ValidationError } from './errors.js';
import { PanoptesClient } from './panoptes.js';
import { validateBech32Address } from './validation.js';
import type {
  AccountInfo,
  BroadcastResult,
  ChainConfig,
  Coin,
  Delegation,
  NodeStatus,
  PreflightResult,
  Proposal,
  Reward,
  TxResponse,
  Validator,
} from './types.js';

export interface ClientOptions {
  retryOptions?: Partial<RetryOptions>;
  endpointStrategy?: 'static' | 'panoptes';
  panoptesUrl?: string;
  panoptesApiKey?: string;
}

export class RepublicClient {
  private rpc: AxiosInstance;
  private rest: AxiosInstance;
  readonly config: ChainConfig;
  private retryOpts: Partial<RetryOptions>;
  private panoptesClient: PanoptesClient | null = null;

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

    if (options?.endpointStrategy === 'panoptes' || options?.panoptesUrl || options?.panoptesApiKey) {
      this.panoptesClient = new PanoptesClient({
        baseUrl: options.panoptesUrl,
        apiKey: options.panoptesApiKey,
      });
    }
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

  /** REST GET with automatic pagination for Cosmos SDK list endpoints */
  private async restGetPaginated<T>(
    path: string,
    itemsKey: string,
    options?: { limit?: number; maxPages?: number },
  ): Promise<T[]> {
    const limit = options?.limit ?? 100;
    const maxPages = options?.maxPages ?? 50;
    const all: T[] = [];
    let nextKey: string | null = null;
    let page = 0;

    do {
      if (page >= maxPages) break;
      const separator = path.includes('?') ? '&' : '?';
      const paginationQuery = nextKey
        ? `${separator}pagination.limit=${limit}&pagination.key=${encodeURIComponent(nextKey)}`
        : `${separator}pagination.limit=${limit}`;

      const data = await this.restGet<Record<string, unknown>>(
        `${path}${paginationQuery}`,
      );
      const items = (data[itemsKey] || []) as T[];
      all.push(...items);

      const pagination = data.pagination as { next_key?: string } | undefined;
      nextKey = pagination?.next_key ?? null;
      page++;
    } while (nextKey);

    return all;
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
    validateBech32Address(address, this.config.addressPrefix);
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
      }>(`/cosmos/auth/v1beta1/accounts/${encodeURIComponent(address)}`);

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
    validateBech32Address(address, this.config.addressPrefix);
    const data = await this.restGet<{ balances?: Coin[] }>(
      `/cosmos/bank/v1beta1/balances/${encodeURIComponent(address)}`,
    );
    return (data.balances || []) as Coin[];
  }

  /** Get specific denom balance */
  async getBalance(address: string, denom?: string): Promise<Coin> {
    validateBech32Address(address, this.config.addressPrefix);
    const d = denom || this.config.denom;
    const data = await this.restGet<{ balance?: Coin }>(
      `/cosmos/bank/v1beta1/balances/${encodeURIComponent(address)}/by_denom?denom=${encodeURIComponent(d)}`,
    );
    return (data.balance || { denom: d, amount: '0' }) as Coin;
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
    } catch (err) {
      // RPC "tx not found" → return null (normal polling)
      if (err instanceof RpcError) return null;
      // Infrastructure errors → rethrow (network down, timeout, etc.)
      throw err;
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
    const raw = await this.restGetPaginated<any>(
      `/cosmos/staking/v1beta1/validators${query}`,
      'validators',
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return raw.map((v: any) => ({
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
    validateBech32Address(validatorAddress, this.config.validatorPrefix);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await this.restGet<any>(
      `/cosmos/staking/v1beta1/validators/${encodeURIComponent(validatorAddress)}`,
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
    validateBech32Address(delegatorAddress, this.config.addressPrefix);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await this.restGetPaginated<any>(
      `/cosmos/staking/v1beta1/delegations/${encodeURIComponent(delegatorAddress)}`,
      'delegation_responses',
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return raw.map((d: any) => ({
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
    validateBech32Address(delegatorAddress, this.config.addressPrefix);
    validateBech32Address(validatorAddress, this.config.validatorPrefix);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await this.restGet<any>(
      `/cosmos/staking/v1beta1/validators/${encodeURIComponent(validatorAddress)}/delegations/${encodeURIComponent(delegatorAddress)}`,
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
    validateBech32Address(delegatorAddress, this.config.addressPrefix);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await this.restGetPaginated<any>(
      `/cosmos/distribution/v1beta1/delegators/${encodeURIComponent(delegatorAddress)}/rewards`,
      'rewards',
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return raw.map((r: any) => ({
      validatorAddress: r.validator_address,
      reward: r.reward || [],
    })) as Reward[];
  }

  /** Get staking reward for a specific validator */
  async getReward(
    delegatorAddress: string,
    validatorAddress: string,
  ): Promise<Coin[]> {
    validateBech32Address(delegatorAddress, this.config.addressPrefix);
    validateBech32Address(validatorAddress, this.config.validatorPrefix);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await this.restGet<any>(
      `/cosmos/distribution/v1beta1/delegators/${encodeURIComponent(delegatorAddress)}/rewards/${encodeURIComponent(validatorAddress)}`,
    );

    return (data.rewards || []) as Coin[];
  }

  // ─── Governance Queries ──────────────────────────────────────────────────────

  /** Get governance proposals */
  async getProposals(status?: string): Promise<Proposal[]> {
    const query = status ? `?proposal_status=${status}` : '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await this.restGetPaginated<any>(
      `/cosmos/gov/v1beta1/proposals${query}`,
      'proposals',
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return raw.map((p: any) => ({
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
      `/cosmos/gov/v1beta1/proposals/${encodeURIComponent(proposalId)}`,
    );

    const p = data.proposal;
    return {
      proposalId: p.proposal_id || p.id,
      title: p.content?.title || p.title || '',
      status: p.status,
      votingEndTime: p.voting_end_time || '',
    };
  }

  // ─── Panoptes Integration ───────────────────────────────────────────────────

  /** Broadcast with optional Panoptes preflight check */
  async broadcastTxSafe(
    txBytes: string,
    preflightParams?: {
      fromAddress: string;
      toAddress?: string;
      amount?: string;
      denom?: string;
    },
    mode: 'sync' | 'async' | 'commit' = 'sync',
  ): Promise<BroadcastResult & { preflight?: PreflightResult }> {
    let preflightResult: PreflightResult | undefined;

    if (preflightParams && this.panoptesClient) {
      try {
        preflightResult = await this.panoptesClient.preflight(preflightParams);
        if (!preflightResult.safe) {
          throw new ValidationError(
            `Preflight check failed: ${preflightResult.recommendation}`,
          );
        }
      } catch (err) {
        if (err instanceof ValidationError) throw err;
        // Panoptes unavailable — proceed without preflight
      }
    }

    const result = await this.broadcastTx(txBytes, mode);
    return { ...result, preflight: preflightResult };
  }
}
