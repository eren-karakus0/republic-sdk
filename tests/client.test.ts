import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RepublicClient } from '../src/client';
import { REPUBLIC_TESTNET } from '../src/constants';

// Mock axios
vi.mock('axios', () => {
  const mockRpcPost = vi.fn();
  const mockRestGet = vi.fn();
  const mockRestPost = vi.fn();

  return {
    default: {
      create: vi.fn((config: { baseURL: string }) => {
        if (config.baseURL === REPUBLIC_TESTNET.rpc) {
          return { post: mockRpcPost };
        }
        return { get: mockRestGet, post: mockRestPost };
      }),
      isAxiosError: (err: unknown) =>
        err && typeof err === 'object' && 'response' in (err as Record<string, unknown>),
    },
    __mockRpcPost: mockRpcPost,
    __mockRestGet: mockRestGet,
    __mockRestPost: mockRestPost,
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockRpcPost: ReturnType<typeof vi.fn>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockRestGet: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  const axiosMock = await import('axios');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockRpcPost = (axiosMock as any).__mockRpcPost;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockRestGet = (axiosMock as any).__mockRestGet;
  vi.clearAllMocks();
});

describe('RepublicClient', () => {
  describe('constructor', () => {
    it('should use default config when none provided', () => {
      const client = new RepublicClient();
      expect(client.config.chainId).toBe(REPUBLIC_TESTNET.chainId);
      expect(client.config.rpc).toBe(REPUBLIC_TESTNET.rpc);
    });

    it('should merge custom config with defaults', () => {
      const client = new RepublicClient({ rpc: 'http://localhost:26657' });
      expect(client.config.rpc).toBe('http://localhost:26657');
      expect(client.config.chainId).toBe(REPUBLIC_TESTNET.chainId);
    });
  });

  describe('getStatus', () => {
    it('should parse node status response', async () => {
      mockRpcPost.mockResolvedValueOnce({
        data: {
          jsonrpc: '2.0',
          id: 1,
          result: {
            node_info: {
              network: 'raitestnet_77701-1',
              moniker: 'test-node',
              version: '0.38.0',
            },
            sync_info: {
              latest_block_height: '100000',
              latest_block_time: '2026-03-01T00:00:00Z',
              catching_up: false,
            },
          },
        },
      });

      const client = new RepublicClient();
      const status = await client.getStatus();

      expect(status.nodeInfo.network).toBe('raitestnet_77701-1');
      expect(status.nodeInfo.moniker).toBe('test-node');
      expect(status.syncInfo.latestBlockHeight).toBe('100000');
      expect(status.syncInfo.catchingUp).toBe(false);
    });

    it('should throw on RPC error', async () => {
      mockRpcPost.mockResolvedValueOnce({
        data: {
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32603, message: 'Internal error' },
        },
      });

      const client = new RepublicClient();
      await expect(client.getStatus()).rejects.toThrow('RPC Error');
    });
  });

  describe('getAccountInfo', () => {
    it('should parse account info from REST', async () => {
      mockRestGet.mockResolvedValueOnce({
        data: {
          account: {
            base_account: {
              address: 'rai12rfm0s7qu0v8mwmx54uepea3kx8d2m6vk6xc0x',
              account_number: '42',
              sequence: '7',
            },
          },
        },
      });

      const client = new RepublicClient();
      const info = await client.getAccountInfo(
        'rai12rfm0s7qu0v8mwmx54uepea3kx8d2m6vk6xc0x',
      );

      expect(info.accountNumber).toBe('42');
      expect(info.sequence).toBe('7');
    });

    it('should return defaults for non-existent account', async () => {
      const error = { response: { status: 404 } };
      mockRestGet.mockRejectedValueOnce(error);

      const client = new RepublicClient();
      const info = await client.getAccountInfo('rai1nonexistent');

      expect(info.accountNumber).toBe('0');
      expect(info.sequence).toBe('0');
    });
  });

  describe('getBalances', () => {
    it('should return account balances', async () => {
      mockRestGet.mockResolvedValueOnce({
        data: {
          balances: [
            { denom: 'arai', amount: '1000000000000000000' },
          ],
        },
      });

      const client = new RepublicClient();
      const balances = await client.getBalances('rai1test');

      expect(balances).toHaveLength(1);
      expect(balances[0].denom).toBe('arai');
      expect(balances[0].amount).toBe('1000000000000000000');
    });
  });

  describe('broadcastTx', () => {
    it('should broadcast and return hash', async () => {
      mockRpcPost.mockResolvedValueOnce({
        data: {
          jsonrpc: '2.0',
          id: 1,
          result: {
            hash: 'ABCDEF1234567890',
            code: 0,
            log: '',
          },
        },
      });

      const client = new RepublicClient();
      const result = await client.broadcastTx('dHhieXRlcw==');

      expect(result.hash).toBe('ABCDEF1234567890');
      expect(result.code).toBe(0);
    });

    it('should throw on non-zero code', async () => {
      mockRpcPost.mockResolvedValueOnce({
        data: {
          jsonrpc: '2.0',
          id: 1,
          result: {
            hash: '',
            code: 4,
            log: 'signature verification failed',
          },
        },
      });

      const client = new RepublicClient();
      await expect(client.broadcastTx('bad')).rejects.toThrow(
        'Broadcast failed',
      );
    });
  });
});
