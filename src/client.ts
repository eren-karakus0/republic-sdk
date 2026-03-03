import axios, { AxiosInstance } from 'axios';
import { REPUBLIC_TESTNET } from './constants.js';
import type {
  AccountInfo,
  BroadcastResult,
  ChainConfig,
  Coin,
  NodeStatus,
  TxResponse,
} from './types.js';

export class RepublicClient {
  private rpc: AxiosInstance;
  private rest: AxiosInstance;
  readonly config: ChainConfig;

  constructor(config?: Partial<ChainConfig>) {
    this.config = { ...REPUBLIC_TESTNET, ...config };

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

  /** Tendermint JSON-RPC call */
  private async rpcCall<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const { data } = await this.rpc.post('', {
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    });

    if (data.error) {
      throw new Error(`RPC Error: ${JSON.stringify(data.error)}`);
    }

    return data.result as T;
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
      const { data } = await this.rest.get(
        `/cosmos/auth/v1beta1/accounts/${address}`,
      );

      const account = data.account || data;
      const baseAccount = account.base_account || account;

      return {
        address: baseAccount.address || address,
        accountNumber: baseAccount.account_number || '0',
        sequence: baseAccount.sequence || '0',
      };
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        return { address, accountNumber: '0', sequence: '0' };
      }
      throw err;
    }
  }

  /** Get account balances */
  async getBalances(address: string): Promise<Coin[]> {
    const { data } = await this.rest.get(
      `/cosmos/bank/v1beta1/balances/${address}`,
    );
    return (data.balances || []) as Coin[];
  }

  /** Get specific denom balance */
  async getBalance(address: string, denom?: string): Promise<Coin> {
    const d = denom || this.config.denom;
    try {
      const { data } = await this.rest.get(
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

    // broadcast_tx_commit has a different response shape:
    //   { hash, height, check_tx: { code, log }, deliver_tx: { code, log } }
    // broadcast_tx_sync / async:
    //   { hash, code, log, codespace }
    if (mode === 'commit') {
      const checkCode = raw.check_tx?.code ?? 0;
      const deliverCode = raw.deliver_tx?.code ?? 0;
      const code = checkCode !== 0 ? checkCode : deliverCode;
      const log = checkCode !== 0
        ? (raw.check_tx?.log ?? '')
        : (raw.deliver_tx?.log ?? '');

      if (code !== 0) {
        throw new Error(`Broadcast failed (code ${code}): ${log}`);
      }

      return {
        hash: raw.hash ?? '',
        code: 0,
        log,
      };
    }

    const code = raw.code ?? 0;
    const log = raw.log ?? '';
    if (code !== 0) {
      throw new Error(`Broadcast failed (code ${code}): ${log}`);
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

    throw new Error(`Timeout waiting for tx ${hash}`);
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
      throw new Error(
        `ABCI query failed: ${result.response.log}`,
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
      throw new Error(
        `Broadcast failed (code ${txResponse.code}): ${txResponse.raw_log}`,
      );
    }

    return {
      hash: txResponse.txhash,
      code: txResponse.code,
      log: txResponse.raw_log || '',
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
