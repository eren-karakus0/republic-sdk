import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { PanoptesClient } from '../src/panoptes';

vi.mock('axios');
const mockGet = vi.fn();
const mockPost = vi.fn();
vi.mocked(axios.create).mockReturnValue({ get: mockGet, post: mockPost } as any);

describe('PanoptesClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(axios.create).mockReturnValue({ get: mockGet, post: mockPost } as any);
  });

  describe('constructor', () => {
    it('should use default baseUrl and timeout', () => {
      new PanoptesClient();
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://panoptes.republicai.io',
          timeout: 10000,
        }),
      );
    });

    it('should use custom options', () => {
      new PanoptesClient({
        baseUrl: 'https://panoptes-staging.example.com',
        apiKey: 'test-key',
        timeout: 5000,
      });
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://panoptes-staging.example.com',
          timeout: 5000,
          headers: expect.objectContaining({ 'x-api-key': 'test-key' }),
        }),
      );
    });

    it('should reject private/internal URLs', () => {
      expect(() => new PanoptesClient({ baseUrl: 'http://localhost:3000' })).toThrow(
        'private/internal network',
      );
      expect(() => new PanoptesClient({ baseUrl: 'http://127.0.0.1:8080' })).toThrow(
        'private/internal network',
      );
      expect(() => new PanoptesClient({ baseUrl: 'http://10.0.0.1' })).toThrow(
        'private/internal network',
      );
    });

    it('should not include x-api-key header when no apiKey provided', () => {
      new PanoptesClient();
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.not.objectContaining({ 'x-api-key': expect.anything() }),
        }),
      );
    });
  });

  describe('getBestEndpoint', () => {
    it('should return best endpoint for type', async () => {
      const endpoint = { url: 'https://rpc.republicai.io', score: 95, type: 'rpc' };
      mockGet.mockResolvedValueOnce({ data: endpoint });

      const client = new PanoptesClient();
      const result = await client.getBestEndpoint('rpc');

      expect(mockGet).toHaveBeenCalledWith('/api/endpoints/best?type=rpc');
      expect(result).toEqual(endpoint);
    });
  });

  describe('preflight', () => {
    it('should return preflight result', async () => {
      const preflightResult = {
        safe: true,
        checks: [{ name: 'balance', passed: true, message: 'OK' }],
        recommendation: 'Safe to proceed',
      };
      mockPost.mockResolvedValueOnce({ data: preflightResult });

      const client = new PanoptesClient();
      const result = await client.preflight({
        fromAddress: 'rai1test',
        toAddress: 'rai1dest',
        amount: '1000000',
        denom: 'arai',
      });

      expect(mockPost).toHaveBeenCalledWith('/api/preflight', {
        fromAddress: 'rai1test',
        toAddress: 'rai1dest',
        amount: '1000000',
        denom: 'arai',
      });
      expect(result.safe).toBe(true);
    });
  });

  describe('getNetworkStats', () => {
    it('should parse network stats', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          latest: {
            totalValidators: 50,
            activeValidators: 40,
            totalStaked: '1000000000000',
            blockHeight: 123456,
          },
        },
      });

      const client = new PanoptesClient();
      const stats = await client.getNetworkStats();

      expect(stats.totalValidators).toBe(50);
      expect(stats.activeValidators).toBe(40);
      expect(stats.totalStaked).toBe('1000000000000');
      expect(stats.blockHeight).toBe('123456');
    });

    it('should return defaults when latest is missing', async () => {
      mockGet.mockResolvedValueOnce({ data: {} });

      const client = new PanoptesClient();
      const stats = await client.getNetworkStats();

      expect(stats.totalValidators).toBe(0);
      expect(stats.activeValidators).toBe(0);
      expect(stats.totalStaked).toBe('0');
      expect(stats.blockHeight).toBe('0');
    });
  });

  describe('getValidatorScore', () => {
    it('should parse validator score', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          validator: { score: 92, missedBlocks: 5 },
        },
      });

      const client = new PanoptesClient();
      const score = await client.getValidatorScore('raivaloper1test');

      expect(mockGet).toHaveBeenCalledWith('/api/validators/raivaloper1test');
      expect(score.validatorId).toBe('raivaloper1test');
      expect(score.score).toBe(92);
      expect(score.missedBlockRate).toBe(5);
      expect(score.governanceScore).toBe(0);
    });

    it('should return defaults when validator data is missing', async () => {
      mockGet.mockResolvedValueOnce({ data: {} });

      const client = new PanoptesClient();
      const score = await client.getValidatorScore('raivaloper1unknown');

      expect(score.score).toBe(0);
      expect(score.missedBlockRate).toBe(0);
    });
  });

  describe('isHealthy', () => {
    it('should return true when API is healthy', async () => {
      mockGet.mockResolvedValueOnce({ data: { status: 'healthy' } });

      const client = new PanoptesClient();
      const healthy = await client.isHealthy();

      expect(healthy).toBe(true);
    });

    it('should return false when API returns non-healthy status', async () => {
      mockGet.mockResolvedValueOnce({ data: { status: 'degraded' } });

      const client = new PanoptesClient();
      const healthy = await client.isHealthy();

      expect(healthy).toBe(false);
    });

    it('should return false when API request fails', async () => {
      mockGet.mockRejectedValueOnce(new Error('Connection refused'));

      const client = new PanoptesClient();
      const healthy = await client.isHealthy();

      expect(healthy).toBe(false);
    });
  });
});
