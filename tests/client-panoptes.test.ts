import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RepublicClient } from '../src/client';
import { ValidationError } from '../src/errors';
import { REPUBLIC_TESTNET } from '../src/constants';

// Mock axios
vi.mock('axios', () => {
  const mockRpcPost = vi.fn();
  const mockRestGet = vi.fn();
  const mockRestPost = vi.fn();
  const mockPanoptesGet = vi.fn();
  const mockPanoptesPost = vi.fn();

  return {
    default: {
      create: vi.fn((config: { baseURL: string }) => {
        if (config.baseURL === REPUBLIC_TESTNET.rpc) {
          return { post: mockRpcPost };
        }
        if (config.baseURL === REPUBLIC_TESTNET.rest) {
          return { get: mockRestGet, post: mockRestPost };
        }
        // Panoptes client
        return { get: mockPanoptesGet, post: mockPanoptesPost };
      }),
      isAxiosError: (err: unknown) =>
        err && typeof err === 'object' && 'response' in (err as Record<string, unknown>),
    },
    __mockRpcPost: mockRpcPost,
    __mockPanoptesPost: mockPanoptesPost,
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockRpcPost: ReturnType<typeof vi.fn>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockPanoptesPost: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  const axiosMock = await import('axios');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockRpcPost = (axiosMock as any).__mockRpcPost;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockPanoptesPost = (axiosMock as any).__mockPanoptesPost;
  vi.clearAllMocks();
});

describe('RepublicClient - broadcastTxSafe', () => {
  it('should broadcast without preflight when panoptes is not configured', async () => {
    mockRpcPost.mockResolvedValueOnce({
      data: {
        jsonrpc: '2.0', id: 1,
        result: { hash: 'ABC123', code: 0, log: '' },
      },
    });

    const client = new RepublicClient();
    const result = await client.broadcastTxSafe('dHhieXRlcw==', {
      fromAddress: 'rai1test',
    });

    expect(result.hash).toBe('ABC123');
    expect(result.preflight).toBeUndefined();
  });

  it('should run preflight and broadcast when panoptes is configured and safe', async () => {
    mockPanoptesPost.mockResolvedValueOnce({
      data: {
        safe: true,
        checks: [{ name: 'balance', passed: true, message: 'OK' }],
        recommendation: 'Safe to proceed',
      },
    });
    mockRpcPost.mockResolvedValueOnce({
      data: {
        jsonrpc: '2.0', id: 1,
        result: { hash: 'DEF456', code: 0, log: '' },
      },
    });

    const client = new RepublicClient(undefined, {
      panoptesUrl: 'https://panoptes.republicai.io',
    });
    const result = await client.broadcastTxSafe('dHhieXRlcw==', {
      fromAddress: 'rai1test',
      toAddress: 'rai1dest',
      amount: '1000000',
    });

    expect(result.hash).toBe('DEF456');
    expect(result.preflight?.safe).toBe(true);
  });

  it('should throw ValidationError when preflight is not safe', async () => {
    mockPanoptesPost.mockResolvedValueOnce({
      data: {
        safe: false,
        checks: [{ name: 'balance', passed: false, message: 'Insufficient balance' }],
        recommendation: 'Top up your account before proceeding',
      },
    });

    const client = new RepublicClient(undefined, {
      panoptesUrl: 'https://panoptes.republicai.io',
    });

    await expect(
      client.broadcastTxSafe('dHhieXRlcw==', { fromAddress: 'rai1test' }),
    ).rejects.toThrow(ValidationError);
  });

  it('should proceed without preflight when panoptes is unavailable', async () => {
    mockPanoptesPost.mockRejectedValueOnce(new Error('Connection refused'));
    mockRpcPost.mockResolvedValueOnce({
      data: {
        jsonrpc: '2.0', id: 1,
        result: { hash: 'GHI789', code: 0, log: '' },
      },
    });

    const client = new RepublicClient(undefined, {
      panoptesUrl: 'https://panoptes.republicai.io',
    });
    const result = await client.broadcastTxSafe('dHhieXRlcw==', {
      fromAddress: 'rai1test',
    });

    expect(result.hash).toBe('GHI789');
    expect(result.preflight).toBeUndefined();
  });

  it('should broadcast without preflight when no preflightParams provided', async () => {
    mockRpcPost.mockResolvedValueOnce({
      data: {
        jsonrpc: '2.0', id: 1,
        result: { hash: 'JKL012', code: 0, log: '' },
      },
    });

    const client = new RepublicClient(undefined, {
      panoptesUrl: 'https://panoptes.republicai.io',
    });
    const result = await client.broadcastTxSafe('dHhieXRlcw==');

    expect(result.hash).toBe('JKL012');
    expect(result.preflight).toBeUndefined();
  });
});
